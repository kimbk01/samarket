import type { ChatMessage } from "@/lib/types/chat";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

type IntegratedRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type?: string;
  body?: string;
  metadata?: unknown;
  created_at?: string;
  read_at?: string | null;
};

function imageUrlFromChatMetadata(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object" || meta === null) return undefined;
  const u = (meta as { imageUrl?: unknown }).imageUrl;
  return typeof u === "string" && u.trim() ? u.trim() : undefined;
}

function mapIntegratedRow(m: IntegratedRow): ChatMessage {
  const messageType = (m.message_type ?? "text") as ChatMessage["messageType"];
  const imageUrl =
    messageType === "image" ? imageUrlFromChatMetadata(m.metadata) : undefined;
  return {
    id: m.id,
    roomId: m.room_id,
    senderId: m.sender_id ?? "",
    message: m.body ?? "",
    messageType,
    imageUrl: imageUrl ?? null,
    readAt: m.read_at ?? null,
    createdAt: m.created_at ?? "",
    isRead: !!m.read_at,
  };
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
