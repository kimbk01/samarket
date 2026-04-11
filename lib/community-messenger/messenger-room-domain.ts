/**
 * 채팅방 도메인 구분 — 거래/배달은 별도 메신저가 아니라 동일 CHATS 목록의 메타/타입 확장으로 취급한다.
 */

import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export function communityMessengerRoomIsTrade(room: CommunityMessengerRoomSummary): boolean {
  const title = `${room.title} ${room.summary} ${room.subtitle}`.toLowerCase();
  return title.includes("거래");
}

export function communityMessengerRoomIsDelivery(room: CommunityMessengerRoomSummary): boolean {
  const title = `${room.title} ${room.summary} ${room.subtitle}`.toLowerCase();
  return title.includes("배달") || title.includes("주문");
}
