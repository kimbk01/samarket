import type { ChatRoomSource } from "@/lib/types/chat";

/**
 * 거래 채팅 알림·딥링크용 URL.
 * `/chats/[roomId]` — 전용 채팅 셸이 가볍고, `source` 로 부트스트랩이 메시지 갈래를 맞춤.
 */
export function tradeChatNotificationHref(roomId: string, source: ChatRoomSource): string {
  const id = roomId.trim();
  if (!id) return "/mypage/trade/chat";
  return `/chats/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`;
}

/**
 * 채팅 목록 카드 등 — `room.source` 가 알려지면 동일 경로에 `?source=` (부트스트랩 힌트).
 * 알 수 없으면 `/chats/[id]` 만 (기존 동작).
 */
export function defaultTradeChatRoomHref(roomId: string, source?: ChatRoomSource | null): string {
  const id = roomId.trim();
  if (!id) return "/mypage/trade/chat";
  if (source === "chat_room" || source === "product_chat") {
    return `/chats/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`;
  }
  return `/chats/${encodeURIComponent(id)}`;
}
