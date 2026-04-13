import type { ChatRoomSource } from "@/lib/types/chat";
import { tradeMessengerRoomHref, TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";

/**
 * 거래 채팅 알림·딥링크용 URL — 메신저 거래 방 (`/community-messenger/rooms/...`).
 */
export function tradeChatNotificationHref(roomId: string, source: ChatRoomSource): string {
  const id = roomId.trim();
  if (!id) return TRADE_CHAT_MESSENGER_LIST_HREF;
  return tradeMessengerRoomHref(id, source);
}

/**
 * 관련 상거래·메신저 액션에서 거래 방으로 이동 — `tradeHubChatRoomHref` 와 동일 목적지.
 */
export function defaultTradeChatRoomHref(roomId: string, source?: ChatRoomSource | null): string {
  return tradeMessengerRoomHref(roomId, source ?? null);
}
