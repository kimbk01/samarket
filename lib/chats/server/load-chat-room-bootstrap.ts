import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { integratedChatRowToMessage } from "@/lib/chats/fetch-chat-room-messages-api";
import {
  loadChatRoomDetailForUser,
  type ChatRoomDetailScope,
} from "@/lib/chats/server/load-chat-room-detail";
import { parseRoomId } from "@/lib/validate-params";
import {
  loadChatMessagesForRoom,
  loadIntegratedChatRoomMessageRowsForUser,
  loadLegacyProductChatMessagesForUser,
} from "@/lib/chats/server/load-chat-room-messages";

async function fetchHintedMessages(
  userId: string,
  roomId: string,
  sourceHint: ChatRoomSource
): Promise<ChatMessage[]> {
  if (sourceHint === "product_chat") {
    const result = await loadLegacyProductChatMessagesForUser(roomId, userId);
    return result.ok ? result.value : [];
  }
  const result = await loadIntegratedChatRoomMessageRowsForUser({ roomId, userId });
  if (!result.ok) return [];
  return result.value
    .map((row) => integratedChatRowToMessage(row))
    .filter((message): message is ChatMessage => message != null);
}

export type ChatRoomBootstrapPayload =
  | { ok: true; room: ChatRoom; messages: ChatMessage[] }
  | { ok: false; status: number; error: string };

/**
 * 채팅방 상세 + 초기 메시지 — API 부트스트랩·RSC 초기 페인트 공용.
 * `source` 힌트가 없을 때는 레거시·통합 메시지 로드를 상세 조회와 병렬로 시작해 지연을 줄입니다.
 */
export async function loadChatRoomBootstrapForUser(input: {
  roomId: string;
  userId: string;
  sourceHint?: ChatRoomSource | null;
  /**
   * `entry`: RSC 등 첫 페인트 — `loadChatRoomDetailForUser` 에서 후기 제출 여부 DB 조회 생략.
   * `full`: 기본 — API·idle 재검증용 완전 메타.
   */
  detailScope?: ChatRoomDetailScope;
}): Promise<ChatRoomBootstrapPayload> {
  const roomId = parseRoomId(input.roomId);
  if (!roomId) {
    return { ok: false, status: 400, error: "roomId 형식이 올바르지 않습니다." };
  }
  const userId = input.userId;
  const sourceHint = input.sourceHint ?? null;
  const detailScope: ChatRoomDetailScope = input.detailScope ?? "full";

  const detailPromise = loadChatRoomDetailForUser({ roomId, userId, detailScope });
  const hintedMessagesPromise =
    sourceHint === "chat_room" || sourceHint === "product_chat"
      ? fetchHintedMessages(userId, roomId, sourceHint).catch(() => [] as ChatMessage[])
      : null;

  const legacySpecPromise =
    hintedMessagesPromise == null ? loadLegacyProductChatMessagesForUser(roomId, userId) : null;
  const integratedSpecPromise =
    hintedMessagesPromise == null ? loadIntegratedChatRoomMessageRowsForUser({ roomId, userId }) : null;

  const detailResult = await detailPromise;
  if (!detailResult.ok) {
    return { ok: false, status: detailResult.status, error: detailResult.error };
  }

  const room = detailResult.room;

  let messages: ChatMessage[];

  if (hintedMessagesPromise && room.source === sourceHint) {
    messages = await hintedMessagesPromise;
  } else if (room.source === "product_chat") {
    const r = legacySpecPromise
      ? await legacySpecPromise
      : await loadLegacyProductChatMessagesForUser(roomId, userId);
    messages = r.ok ? r.value : await loadChatMessagesForRoom({ room, userId });
  } else if (room.source === "chat_room") {
    if (room.generalChat?.kind === "store_order") {
      messages = await loadChatMessagesForRoom({ room, userId });
    } else {
      const r = integratedSpecPromise
        ? await integratedSpecPromise
        : await loadIntegratedChatRoomMessageRowsForUser({ roomId, userId });
      messages = r.ok
        ? r.value
            .map((row) => integratedChatRowToMessage(row))
            .filter((message): message is ChatMessage => message != null)
        : await loadChatMessagesForRoom({ room, userId });
    }
  } else {
    messages = await loadChatMessagesForRoom({ room, userId });
  }

  return { ok: true, room, messages };
}
