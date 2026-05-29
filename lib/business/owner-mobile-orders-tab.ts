import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";

/**
 * 매장 주문 관리 모바일 UI — URL `tab`·목록 필터·`order_id` 딥링크 단일 소스.
 * DO NOT: `orderMatchesStoreTab` / `ownerOrderMainTabForStatus` 와 따로 쓰면 펼치기 후 탭이 바뀌며 카드가 사라진다.
 */
export const OWNER_MOBILE_ORDER_TAB_IDS = [
  "new",
  "progress",
  "shipping",
  "done",
  "cancelled",
] as const satisfies readonly StoreOrderTabId[];

export type OwnerMobileOrderTabId = (typeof OWNER_MOBILE_ORDER_TAB_IDS)[number];

export function isOwnerMobileOrderTabId(tab: StoreOrderTabId): tab is OwnerMobileOrderTabId {
  return (OWNER_MOBILE_ORDER_TAB_IDS as readonly string[]).includes(tab);
}

/** 목록 기본 탭 — `tab=all`·레거시 칩 URL 을 모바일 5탭으로 정규화 */
export function effectiveOwnerMobileOrdersTab(tab: StoreOrderTabId): OwnerMobileOrderTabId {
  if (isOwnerMobileOrderTabId(tab)) return tab;
  switch (tab) {
    case "accepted":
    case "preparing":
    case "ready":
      return "progress";
    case "refund":
      return "cancelled";
    default:
      return "new";
  }
}

export function orderMatchesOwnerMobileOrdersTab(
  order: { order_status: string },
  tab: StoreOrderTabId
): boolean {
  return orderMatchesOwnerMobileOrdersTabId(order, effectiveOwnerMobileOrdersTab(tab));
}

export function orderMatchesOwnerMobileOrdersTabId(
  order: { order_status: string },
  tab: OwnerMobileOrderTabId
): boolean {
  const s = order.order_status;
  switch (tab) {
    case "new":
      return s === "pending";
    case "progress":
      return s === "accepted" || s === "preparing" || s === "ready_for_pickup";
    case "shipping":
      return s === "delivering" || s === "arrived";
    case "done":
      return s === "completed";
    case "cancelled":
      return s === "cancelled" || s === "cancel_requested" || s === "refunded" || s === "refund_requested";
    default:
      return false;
  }
}

/** `order_id` 하이라이트·펼치기 시 URL `tab` 동기화 */
export function ownerMobileOrdersTabForStatus(orderStatus: string): OwnerMobileOrderTabId {
  const s = orderStatus.trim();
  if (s === "pending") return "new";
  if (s === "completed") return "done";
  if (s === "cancelled" || s === "cancel_requested" || s === "refunded" || s === "refund_requested") return "cancelled";
  if (s === "delivering" || s === "arrived") return "shipping";
  if (s === "accepted" || s === "preparing" || s === "ready_for_pickup") return "progress";
  return "progress";
}
