import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";

/** FAB 주문내역 — 신규·환불·취소 요청 주문 target */
export function resolveFabOwnerOrdersBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.orderAttention) || 0));
}

/** FAB 스토어(운영센터) — 리뷰 + 문의 target (주문·채팅 제외) */
export function resolveFabOwnerStoreBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return (
    Math.max(0, Math.floor(Number(bd.inquiryAttention) || 0)) +
    Math.max(0, Math.floor(Number(bd.ownerReviewAttention) || 0))
  );
}

/** FAB 주문채팅 — unread **방** 수 */
export function resolveFabOwnerOrderChatBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.storeOrderChatUnread) || 0));
}

/**
 * @deprecated toggle ops — FAB row badges 사용. 합산은 하단 탭과 섞지 않음.
 */
export function resolveOwnerOperationsCenterAttentionCount(bd: OwnerHubBadgeBreakdown): number {
  return (
    resolveFabOwnerOrdersBadgeCount(bd) +
    resolveFabOwnerStoreBadgeCount(bd) +
    resolveFabOwnerOrderChatBadgeCount(bd)
  );
}

/** 소유 매장이 있을 때 하단 「배달」탭 — 매장 할 일은 FAB 전용 */
export function resolveBottomNavStoresTabBadgeForOwnerStore(
  bd: OwnerHubBadgeBreakdown,
  hasOwnerStore: boolean
): number {
  if (hasOwnerStore) return 0;
  return Math.max(0, Math.floor(Number(bd.storesTabAttention) || 0));
}

/**
 * 하단 「메신저」탭 — Rebuild: unread room count (`communityMessengerUnread` /
 * bottom_nav_chat = consumer chat_room only). Owner 주문·매장 채팅은 FAB 전용 축이라
 * Chat room count와 차감·혼합하지 않는다 (구 event/commerce overlap 차감 폐기).
 */
export function resolveBottomNavMessengerTabBadgeForOwnerStore(
  bd: OwnerHubBadgeBreakdown,
  _hasOwnerStore: boolean
): number {
  return resolveMessengerTabTotalUnreadBadgeCount(bd);
}
