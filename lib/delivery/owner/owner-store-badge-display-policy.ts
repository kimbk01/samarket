import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { ownerPresentationTotal } from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";

/** FAB 주문내역 — C_store order Action Required (pending+refund+cancel) */
export function resolveFabOwnerOrdersBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.orderAttention) || 0));
}

/**
 * FAB 스토어(운영센터) — C_store open inquiry only.
 * REVIEW = UNKNOWN_BLOCKED (ownerReviewAttention ignored).
 */
export function resolveFabOwnerStoreBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.inquiryAttention) || 0));
}

/** FAB 주문채팅 — B_store unread rooms (not C_store) */
export function resolveFabOwnerOrderChatBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.storeOrderChatUnread) || 0));
}

/**
 * Owner Operations badge (C_store authority) — orders + inquiry.
 * DO NOT include B_store chat.
 */
export function resolveOwnerOperationsCenterAttentionCount(bd: OwnerHubBadgeBreakdown): number {
  return resolveFabOwnerOrdersBadgeCount(bd) + resolveFabOwnerStoreBadgeCount(bd);
}

/**
 * Presentation-only sum (B_store + C_store). Never API/DB/FCM/Native authority.
 */
export function resolveOwnerPresentationTotalBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return ownerPresentationTotal(
    resolveFabOwnerOrderChatBadgeCount(bd),
    resolveOwnerOperationsCenterAttentionCount(bd)
  ).total;
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
