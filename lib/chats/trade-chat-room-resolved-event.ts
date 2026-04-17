import type { ChatRoomSource } from "@/lib/types/chat";

/** `createOrGetChatRoom` 성공 직후 — 상품·찜 화면이 `/api/chat/item/room-id` 응답을 기다리지 않고 CTA 를 갱신 */
export const KASAMA_TRADE_CHAT_ROOM_RESOLVED = "kasama:trade-chat-room-resolved";

export type TradeChatRoomResolvedDetail = {
  productId: string;
  roomId: string;
  messengerRoomId?: string | null;
  roomSource: ChatRoomSource;
};

export function emitTradeChatRoomResolved(detail: TradeChatRoomResolvedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TradeChatRoomResolvedDetail>(KASAMA_TRADE_CHAT_ROOM_RESOLVED, { detail }));
}
