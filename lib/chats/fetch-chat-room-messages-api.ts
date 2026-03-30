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

/** POST 직후 캐시된 GET 결과가 남아 내 메시지가 안 보이는 현상 방지 */
export function bustIntegratedChatMessagesCache(roomId: string): void {
  forgetSingleFlight(integratedMessagesKey(roomId));
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
      if (!res.ok) return [];
      const data = await res.json();
      const raw = Array.isArray(data?.messages) ? (data.messages as IntegratedRow[]) : [];
      return raw.map(mapIntegratedRow);
    } catch {
      return [];
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
      if (!res.ok) return [];
      const apiMessages = await res.json();
      return Array.isArray(apiMessages) ? (apiMessages as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
}
