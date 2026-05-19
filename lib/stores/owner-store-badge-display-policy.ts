import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";

/**
 * 매장 오너 **운영 센터** 단일 뱃지 — 신규·환불 주문, 문의, 주문 채팅 미읽음.
 * 하단 「배달」「메신저」탭에는 넣지 않는다.
 */
export function resolveOwnerOperationsCenterAttentionCount(bd: OwnerHubBadgeBreakdown): number {
  return (
    Math.max(0, Math.floor(Number(bd.orderAttention) || 0)) +
    Math.max(0, Math.floor(Number(bd.inquiryAttention) || 0)) +
    Math.max(0, Math.floor(Number(bd.storeOrderChatUnread) || 0))
  );
}

/** 소유 매장이 있을 때 하단 「배달」탭 — 매장 할 일은 운영 센터로만 */
export function resolveBottomNavStoresTabBadgeForOwnerStore(
  bd: OwnerHubBadgeBreakdown,
  hasOwnerStore: boolean
): number {
  if (hasOwnerStore) return 0;
  return Math.max(0, Math.floor(Number(bd.storesTabAttention) || 0));
}

/**
 * 소유 매장이 있을 때 하단 「메신저」탭 — 주문·매장 채팅 미읽음은 운영 센터로만.
 * (개인·거래·커뮤니티 DM 등은 기존 메신저 합산 유지)
 */
export function resolveBottomNavMessengerTabBadgeForOwnerStore(
  bd: OwnerHubBadgeBreakdown,
  hasOwnerStore: boolean
): number {
  const base = resolveMessengerTabTotalUnreadBadgeCount(bd);
  if (!hasOwnerStore) return base;
  /** 신규 주문·주문채팅이 CM unread 와 겹치면 메신저 탭에 이중 표시하지 않음 */
  const storeOpsOverlap = Math.max(
    Math.max(0, Math.floor(Number(bd.storeOrderChatUnread) || 0)),
    Math.max(0, Math.floor(Number(bd.orderAttention) || 0))
  );
  return Math.max(0, base - storeOpsOverlap);
}
