import type { ChatMessage, ChatRoom } from "@/lib/types/chat";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";

function trimIdSet(...xs: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const x of xs) {
    const t = typeof x === "string" ? x.trim() : "";
    if (t) s.add(t);
  }
  return s;
}

/**
 * 판매 단계 변경 API·Broadcast가 돌려준 `threadNotices` 중, 현재 채팅방(통합 `chat_rooms` vs 레거시 `product_chats`)에 해당하는 항목만 고른다.
 * `loadChatRoomDetail` 의 trade-crsame 분기처럼 `room.id` 가 통합 방이고 `productChatRoomId` 가 레거시 id 인 경우도 `integrated` 메시지의 `roomId` 와 맞춘다.
 */
export function tradeListingNoticesForCurrentRoom(
  room: Pick<ChatRoom, "id" | "source" | "chatRoomId" | "productChatRoomId">,
  notices: TradeListingThreadNotice[] | null | undefined
): ChatMessage[] {
  const primary = room.id.trim();
  if (!primary || !notices?.length) return [];
  const isIntegrated = room.source === "chat_room";
  const integratedIds = trimIdSet(room.id, room.chatRoomId);
  const legacyIds = trimIdSet(room.id, room.productChatRoomId);
  const out: ChatMessage[] = [];
  for (const n of notices) {
    if (!n?.message?.id || typeof n.message.roomId !== "string") continue;
    const mr = n.message.roomId.trim();
    if (!mr) continue;
    if (n.channel === "integrated" && isIntegrated && integratedIds.has(mr)) out.push(n.message);
    if (n.channel === "legacy_product_chat" && !isIntegrated && legacyIds.has(mr)) out.push(n.message);
  }
  return out;
}

/** 동일 거래 스레드에 묶인 방 식별자(통합·레거시) — 이벤트 `roomId` 힌트와 교차 매칭에 사용 */
export function tradeChatLinkedRoomIdSet(
  room: Pick<ChatRoom, "id" | "chatRoomId" | "productChatRoomId">
): Set<string> {
  return trimIdSet(room.id, room.chatRoomId, room.productChatRoomId);
}
