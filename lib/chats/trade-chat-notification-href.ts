import type { ChatRoomSource } from "@/lib/types/chat";

/**
 * 거래 채팅 알림·딥링크용 URL.
 * `/chats/[roomId]` 부트스트랩이 `source` 쿼리로 상세·메시지 로드를 병렬화할 수 있게 함.
 */
export function tradeChatNotificationHref(roomId: string, source: ChatRoomSource): string {
  const id = roomId.trim();
  if (!id) return "/mypage/trade/chat";
  return `/chats/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`;
}
