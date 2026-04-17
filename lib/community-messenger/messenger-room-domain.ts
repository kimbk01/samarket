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

/**
 * 메신저 채팅 탭 목록에서 1:1 행을 합칠 때의 그룹 키.
 * 거래·배달 맥락이 있는 방은 **동일 peer 의 친구 DM 과 합치지 않음** —
 * 그렇지 않으면 `kind=trade` 필터에서 줄이 사라지고 item_trade 쪽 미읽음 뱃지만 남는 정합 깨짐이 난다.
 */
export function messengerDirectThreadListCollapseKey(room: CommunityMessengerRoomSummary): string {
  if (room.roomType !== "direct") return `id:${room.id}`;
  const peer = room.peerUserId?.trim();
  if (!peer) return `id:${room.id}`;
  if (communityMessengerRoomIsTrade(room) || communityMessengerRoomIsDelivery(room)) {
    return `id:${room.id}`;
  }
  return `direct:${peer}`;
}
