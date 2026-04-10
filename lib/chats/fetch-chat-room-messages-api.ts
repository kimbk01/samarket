import type { ChatMessage } from "@/lib/types/chat";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

type IntegratedRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  sender_nickname?: string | null;
  message_type?: string;
  body?: string;
  metadata?: unknown;
  created_at?: string;
  read_at?: string | null;
  deleted_by_sender?: boolean;
  is_hidden_by_admin?: boolean;
  hidden_reason?: string | null;
};

function imageFieldsFromChatMetadata(
  meta: unknown,
  messageType: string
): { imageUrl: string | null; imageUrls?: string[] } {
  if (messageType !== "image") return { imageUrl: null };
  if (!meta || typeof meta !== "object" || meta === null) return { imageUrl: null };
  const m = meta as { imageUrls?: unknown; imageUrl?: unknown };
  if (Array.isArray(m.imageUrls)) {
    const urls = m.imageUrls
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim());
    if (urls.length > 0) {
      return {
        imageUrl: urls[0] ?? null,
        imageUrls: urls.length > 1 ? urls : undefined,
      };
    }
  }
  const u = (meta as { imageUrl?: unknown }).imageUrl;
  const one = typeof u === "string" && u.trim() ? u.trim() : "";
  return { imageUrl: one || null };
}

function senderNicknameFromChatMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || meta === null) return null;
  const raw = (meta as { senderNickname?: unknown }).senderNickname;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function mapIntegratedRow(m: IntegratedRow): ChatMessage {
  const messageType = (m.message_type ?? "text") as ChatMessage["messageType"];
  const imgs = imageFieldsFromChatMetadata(m.metadata, messageType ?? "text");
  const senderNickname =
    typeof m.sender_nickname === "string" && m.sender_nickname.trim()
      ? m.sender_nickname.trim()
      : senderNicknameFromChatMetadata(m.metadata);
  return {
    id: m.id,
    roomId: m.room_id,
    senderId: m.sender_id ?? "",
    senderNickname,
    message: m.body ?? "",
    messageType,
    imageUrl: imgs.imageUrl,
    imageUrls: imgs.imageUrls,
    isHidden: m.is_hidden_by_admin === true,
    hiddenReason: typeof m.hidden_reason === "string" ? m.hidden_reason : null,
    readAt: m.read_at ?? null,
    createdAt: m.created_at ?? "",
    isRead: !!m.read_at,
  };
}

/** Supabase Realtime `chat_messages` 행 → 앱 메시지 */
export function integratedChatRowToMessage(
  row: Record<string, unknown> | null | undefined,
  opts?: { includeHiddenMessages?: boolean; hiddenReasonPrefix?: string }
): ChatMessage | null {
  if (!row || typeof row.id !== "string" || typeof row.room_id !== "string") return null;
  if (row.deleted_by_sender === true) return null;
  if (row.is_hidden_by_admin === true) {
    const hiddenReason = typeof row.hidden_reason === "string" ? row.hidden_reason : "";
    const canInclude =
      opts?.includeHiddenMessages === true &&
      hiddenReason.length > 0 &&
      hiddenReason.startsWith(opts.hiddenReasonPrefix ?? "");
    if (!canInclude) return null;
  }
  return mapIntegratedRow(row as unknown as IntegratedRow);
}

const integratedMessagesKey = (roomId: string) => `chat:integrated-messages:${roomId}`;
/** 클라이언트 메시지 메모리 캐시 TTL — `ChatDetailView` 초기 로드·스켈레톤 회피와 동일 기준 */
export const CHAT_MESSAGE_CLIENT_CACHE_TTL_MS = 20_000;
const MESSAGE_CACHE_TTL_MS = CHAT_MESSAGE_CLIENT_CACHE_TTL_MS;
type MessageCacheEntry = { messages: ChatMessage[]; updatedAt: number };
const integratedMessageCache = new Map<string, MessageCacheEntry>();
const legacyMessageCache = new Map<string, MessageCacheEntry>();
/** TTL 지난 항목이 `read` 없이 쌓이면 Map 이 커져 장시간 탭에서 메모리·GC 부담 — 쓰기 시 정리 */
const MAX_MESSAGE_CACHE_ROOMS = 64;

function pruneExpiredMessageCache(cache: Map<string, MessageCacheEntry>) {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.updatedAt > MESSAGE_CACHE_TTL_MS) cache.delete(k);
  }
}

function evictOldestMessageCacheIfNeeded(cache: Map<string, MessageCacheEntry>) {
  while (cache.size > MAX_MESSAGE_CACHE_ROOMS) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) {
      if (v.updatedAt < oldestAt) {
        oldestAt = v.updatedAt;
        oldestKey = k;
      }
    }
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }
}

function cloneChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    imageUrls: Array.isArray(message.imageUrls) ? [...message.imageUrls] : message.imageUrls,
    replyTo: message.replyTo ? { ...message.replyTo } : message.replyTo,
    reactions: message.reactions?.map((reaction) => ({ ...reaction })),
  }));
}

function readMessageCache(cache: Map<string, MessageCacheEntry>, roomId: string): ChatMessage[] | null {
  const entry = cache.get(roomId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > MESSAGE_CACHE_TTL_MS) {
    cache.delete(roomId);
    return null;
  }
  return cloneChatMessages(entry.messages);
}

function hasFreshMessageCache(cache: Map<string, MessageCacheEntry>, roomId: string, maxAgeMs: number): boolean {
  const entry = cache.get(roomId);
  if (!entry) return false;
  const ageMs = Date.now() - entry.updatedAt;
  if (ageMs > MESSAGE_CACHE_TTL_MS) {
    cache.delete(roomId);
    return false;
  }
  return ageMs <= maxAgeMs;
}

function writeMessageCache(cache: Map<string, MessageCacheEntry>, roomId: string, messages: ChatMessage[]): ChatMessage[] {
  pruneExpiredMessageCache(cache);
  const cloned = cloneChatMessages(messages);
  cache.set(roomId, { messages: cloned, updatedAt: Date.now() });
  evictOldestMessageCacheIfNeeded(cache);
  return cloneChatMessages(cloned);
}

/** POST 직후 캐시된 GET 결과가 남아 내 메시지가 안 보이는 현상 방지 */
export function bustIntegratedChatMessagesCache(roomId: string): void {
  forgetSingleFlight(integratedMessagesKey(roomId));
}

export function peekIntegratedChatRoomMessagesCache(roomId: string): ChatMessage[] | null {
  return readMessageCache(integratedMessageCache, roomId);
}

export function peekLegacyChatRoomMessagesCache(roomId: string): ChatMessage[] | null {
  return readMessageCache(legacyMessageCache, roomId);
}

export function hasFreshIntegratedChatRoomMessagesCache(roomId: string, maxAgeMs = 2500): boolean {
  return hasFreshMessageCache(integratedMessageCache, roomId, maxAgeMs);
}

export function hasFreshLegacyChatRoomMessagesCache(roomId: string, maxAgeMs = 2500): boolean {
  return hasFreshMessageCache(legacyMessageCache, roomId, maxAgeMs);
}

export function updateIntegratedChatRoomMessagesCache(roomId: string, messages: ChatMessage[]): void {
  writeMessageCache(integratedMessageCache, roomId, messages);
}

export function updateLegacyChatRoomMessagesCache(roomId: string, messages: ChatMessage[]): void {
  writeMessageCache(legacyMessageCache, roomId, messages);
}

/** 통합 채팅방 GET …/api/chat/rooms/:id/messages (동시 호출 합류) */
export function fetchIntegratedChatRoomMessages(roomId: string): Promise<ChatMessage[]> {
  const key = integratedMessagesKey(roomId);
  return runSingleFlight(key, async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return readMessageCache(integratedMessageCache, roomId) ?? [];
      const data = await res.json();
      const raw = Array.isArray(data?.messages) ? (data.messages as IntegratedRow[]) : [];
      return writeMessageCache(
        integratedMessageCache,
        roomId,
        raw.map(mapIntegratedRow)
      );
    } catch {
      return readMessageCache(integratedMessageCache, roomId) ?? [];
    }
  });
}

/** 레거시 방 GET …/api/chat/room/:id/messages (동시 호출 합류) */
export function fetchLegacyChatRoomMessages(roomId: string): Promise<ChatMessage[]> {
  const key = `chat:legacy-messages:${roomId}`;
  return runSingleFlight(key, async () => {
    try {
      const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}/messages`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return readMessageCache(legacyMessageCache, roomId) ?? [];
      const apiMessages = await res.json();
      return writeMessageCache(
        legacyMessageCache,
        roomId,
        Array.isArray(apiMessages) ? (apiMessages as ChatMessage[]) : []
      );
    } catch {
      return readMessageCache(legacyMessageCache, roomId) ?? [];
    }
  });
}
