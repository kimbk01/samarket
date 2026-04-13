/**
 * 채팅방 도메인 구분 — 거래/배달 카드는 메신저 목록에서 **표시용 메타**로만 쓰인다.
 * 사용자 대면 「채팅 3종」 정의·Philife·스토어 스트림·통화와의 혼동 금지는
 * `lib/chat-domain/samarket-three-chat-pillars.ts` 를 따른다.
 */

import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export function communityMessengerRoomIsTrade(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "trade") return true;
  const title = `${room.title} ${room.summary} ${room.subtitle}`.toLowerCase();
  return title.includes("거래");
}

export function communityMessengerRoomIsDelivery(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "delivery") return true;
  const title = `${room.title} ${room.summary} ${room.subtitle}`.toLowerCase();
  return title.includes("배달") || title.includes("주문");
}
