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

/** 서버 기본과 동일 — 휴리스틱·쿼리에 공통 사용 */
export const INTEGRATED_CHAT_MESSAGES_DEFAULT_LIMIT = 50;
/** 레거시 product_chat GET 기본 — 서버 `loadLegacyProductChatMessagesPageForUser` 기본과 동기 */
export const LEGACY_PRODUCT_CHAT_MESSAGES_DEFAULT_LIMIT = 50;
/** 서버 부트스트랩 `LEGACY_PRODUCT_CHAT_BOOTSTRAP_MESSAGE_LIMIT`(30) 과 동기 — 클라 hasMore 휴리스틱 */
export const LEGACY_PRODUCT_CHAT_BOOTSTRAP_HINT = 30;

export type IntegratedChatHistoryCursor = { before: string; beforeCreatedAt: string };

export type IntegratedMessagesPageResult = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: IntegratedChatHistoryCursor | null;
};

function parseIntegratedMessagesPayload(data: unknown): IntegratedMessagesPageResult {
  const d = data as Record<string, unknown> | null;
  const raw = Array.isArray(d?.messages) ? (d.messages as IntegratedRow[]) : [];
  const messages = raw.map(mapIntegratedRow);
  const hasMore = d?.hasMore === true;
  const nc = d?.nextCursor as Record<string, unknown> | undefined;
  const nextCursor =
    nc && typeof nc.before === "string" && typeof nc.beforeCreatedAt === "string"
      ? { before: nc.before, beforeCreatedAt: nc.beforeCreatedAt }
      : null;
  return { messages, hasMore, nextCursor };
}

/**
 * 최신 페이지 + `hasMore` / `nextCursor`(과거 로드용) — 초기 GET 과 동일 single-flight.
 */
export function fetchIntegratedChatRoomMessagesWithMeta(
  roomId: string,
  opts?: { limit?: number }
): Promise<IntegratedMessagesPageResult> {
  const limit = Math.min(Math.max(opts?.limit ?? INTEGRATED_CHAT_MESSAGES_DEFAULT_LIMIT, 1), 100);
  const key = integratedMessagesKey(roomId);
  return runSingleFlight(key, async () => {
    try {
      const res = await fetch(
        `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?limit=${limit}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) {
        const cached = readMessageCache(integratedMessageCache, roomId);
        return { messages: cached ?? [], hasMore: false, nextCursor: null };
      }
      const data = await res.json();
      const parsed = parseIntegratedMessagesPayload(data);
      writeMessageCache(integratedMessageCache, roomId, parsed.messages);
      return parsed;
    } catch {
      const cached = readMessageCache(integratedMessageCache, roomId);
      return { messages: cached ?? [], hasMore: false, nextCursor: null };
    }
  });
}

/** 과거 페이지 — 커서마다 별도 요청(single-flight 비적용) */
export async function fetchIntegratedChatRoomMessagesPage(
  roomId: string,
  input: { cursor: IntegratedChatHistoryCursor; limit?: number }
): Promise<IntegratedMessagesPageResult> {
  const limit = Math.min(Math.max(input.limit ?? INTEGRATED_CHAT_MESSAGES_DEFAULT_LIMIT, 1), 100);
  const params = new URLSearchParams({
    limit: String(limit),
    before: input.cursor.before,
    beforeCreatedAt: input.cursor.beforeCreatedAt,
  });
  const res = await fetch(
    `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
    { credentials: "include", cache: "no-store" }
  );
  if (!res.ok) {
    return { messages: [], hasMore: false, nextCursor: null };
  }
  const data = await res.json();
  return parseIntegratedMessagesPayload(data);
}

/** 부트스트랩·캐시 등 `hasMore` 를 모를 때 — 한 페이지가 꽉 찼으면 과거가 더 있을 수 있음 */
export function guessIntegratedHistoryMetaFromMessages(list: ChatMessage[]): {
  hasMore: boolean;
  nextCursor: IntegratedChatHistoryCursor | null;
} {
  if (list.length < INTEGRATED_CHAT_MESSAGES_DEFAULT_LIMIT) {
    return { hasMore: false, nextCursor: null };
  }
  const oldest = list[0];
  if (!oldest?.id || !oldest.createdAt) {
    return { hasMore: false, nextCursor: null };
  }
  return {
    hasMore: true,
    nextCursor: { before: oldest.id, beforeCreatedAt: oldest.createdAt },
  };
}

/** 통합 채팅방 GET …/api/chat/rooms/:id/messages (동시 호출 합류) */
export function fetchIntegratedChatRoomMessages(roomId: string): Promise<ChatMessage[]> {
  return fetchIntegratedChatRoomMessagesWithMeta(roomId).then((r) => r.messages);
}

export type LegacyMessagesPageResult = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: IntegratedChatHistoryCursor | null;
};

function parseLegacyMessagesPayload(data: unknown): LegacyMessagesPageResult {
  const d = data as Record<string, unknown> | null;
  const raw = Array.isArray(d?.messages) ? (d.messages as ChatMessage[]) : [];
  const hasMore = d?.hasMore === true;
  const nc = d?.nextCursor as Record<string, unknown> | undefined;
  const nextCursor =
    nc && typeof nc.before === "string" && typeof nc.beforeCreatedAt === "string"
      ? { before: nc.before, beforeCreatedAt: nc.beforeCreatedAt }
      : null;
  return { messages: raw, hasMore, nextCursor };
}

/**
 * 레거시 product_chat 최신 페이지 + hasMore / nextCursor — 초기 GET 과 동일 single-flight.
 */
export function fetchLegacyChatRoomMessagesWithMeta(
  roomId: string,
  opts?: { limit?: number }
): Promise<LegacyMessagesPageResult> {
  const limit = Math.min(Math.max(opts?.limit ?? LEGACY_PRODUCT_CHAT_MESSAGES_DEFAULT_LIMIT, 1), 100);
  const key = `chat:legacy-messages:${roomId}`;
  return runSingleFlight(key, async () => {
    try {
      const res = await fetch(
        `/api/chat/room/${encodeURIComponent(roomId)}/messages?limit=${limit}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) {
        const cached = readMessageCache(legacyMessageCache, roomId);
        return { messages: cached ?? [], hasMore: false, nextCursor: null };
      }
      const data = await res.json();
      const parsed = parseLegacyMessagesPayload(data);
      writeMessageCache(legacyMessageCache, roomId, parsed.messages);
      return parsed;
    } catch {
      const cached = readMessageCache(legacyMessageCache, roomId);
      return { messages: cached ?? [], hasMore: false, nextCursor: null };
    }
  });
}

/** 과거 페이지 — 레거시 product_chat 키셋 */
export async function fetchLegacyChatRoomMessagesPage(
  roomId: string,
  input: { cursor: IntegratedChatHistoryCursor; limit?: number }
): Promise<LegacyMessagesPageResult> {
  const limit = Math.min(Math.max(input.limit ?? LEGACY_PRODUCT_CHAT_MESSAGES_DEFAULT_LIMIT, 1), 100);
  const params = new URLSearchParams({
    limit: String(limit),
    before: input.cursor.before,
    beforeCreatedAt: input.cursor.beforeCreatedAt,
  });
  const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}/messages?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    return { messages: [], hasMore: false, nextCursor: null };
  }
  const data = await res.json();
  return parseLegacyMessagesPayload(data);
}

/** 부트스트랩·캐시 등 — 한 페이지가 부트스트랩 한도와 같으면 과거가 더 있을 수 있음 */
export function guessLegacyHistoryMetaFromMessages(list: ChatMessage[]): {
  hasMore: boolean;
  nextCursor: IntegratedChatHistoryCursor | null;
} {
  if (list.length < LEGACY_PRODUCT_CHAT_BOOTSTRAP_HINT) {
    return { hasMore: false, nextCursor: null };
  }
  const oldest = list[0];
  if (!oldest?.id || !oldest.createdAt) {
    return { hasMore: false, nextCursor: null };
  }
  return {
    hasMore: true,
    nextCursor: { before: oldest.id, beforeCreatedAt: oldest.createdAt },
  };
}

/** 레거시 방 GET …/api/chat/room/:id/messages (동시 호출 합류) */
export function fetchLegacyChatRoomMessages(roomId: string): Promise<ChatMessage[]> {
  return fetchLegacyChatRoomMessagesWithMeta(roomId).then((r) => r.messages);
}
