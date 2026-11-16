import type { MessengerRoomListSource } from "@/lib/community-messenger/messenger-entry-origin";
import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * 메신저 밖(앱 안 배너 등)에서 방을 열 때 그 방이 속한 목록 — 거래 방 = 거래 채팅, 주문 방 = 주문 채팅, 그 외 = 대화.
 * 방 정보가 없으면 대화(지금과 같음).
 * @see docs/audit/messenger-split-left-list-audit-plan-2026-11-16.md P3
 */
export function messengerRoomListSourceForRoom(
  room: CommunityMessengerRoomSummary | null | undefined
): MessengerRoomListSource {
  if (!room) return "inbox";
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  if (communityMessengerRoomIsConfirmedDelivery(room)) return "delivery";
  return "inbox";
}
