import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";
import type { MessageKey } from "@/lib/i18n/messages";
import { orderStagePosition } from "@/lib/stores/store-order-process-model";

/**
 * 매장 주문 관리 탭 — URL `tab`·목록 필터·`order_id` 딥링크 단일 소스 (PC·모바일 같은 1벌).
 * 탭 = 4단계 정본 (Owner 2026-11-04 · 설계안 v2 §3-5): 전체 · 접수 대기 · 주문접수 · 조리중 · 배달중·픽업대기 · 완료 · 취소·환불 · 환불 요청
 * DO NOT: `orderMatchesStoreTab` / `ownerOrderMainTabForStatus` 와 따로 쓰면 펼치기 후 탭이 바뀌며 카드가 사라진다.
 */
export const OWNER_MOBILE_ORDER_TAB_IDS = [
  "every",
  "new",
  "accepted",
  "preparing",
  "shipping",
  "done",
  "cancelled",
  "refund",
] as const satisfies readonly StoreOrderTabId[];

export type OwnerMobileOrderTabId = (typeof OWNER_MOBILE_ORDER_TAB_IDS)[number];

/** 탭 이름 — 정본 용어 키 */
export const OWNER_ORDER_TAB_LABEL_KEYS: Record<OwnerMobileOrderTabId, MessageKey> = {
  every: "order_stage_tab_all",
  new: "order_stage_pending",
  accepted: "order_stage_accepted",
  preparing: "order_stage_preparing",
  shipping: "order_stage_tab_third",
  done: "order_stage_tab_done",
  cancelled: "order_stage_tab_cancelled",
  refund: "order_stage_refund_requested",
};

type TabOrder = { order_status: string; fulfillment_type?: string | null };

export function isOwnerMobileOrderTabId(tab: StoreOrderTabId): tab is OwnerMobileOrderTabId {
  return (OWNER_MOBILE_ORDER_TAB_IDS as readonly string[]).includes(tab);
}

/** 목록 기본 탭 — 탭 없음(`all`) = 접수 대기 · 레거시 URL(`progress`·`ready`) 정규화 */
export function effectiveOwnerMobileOrdersTab(tab: StoreOrderTabId): OwnerMobileOrderTabId {
  if (isOwnerMobileOrderTabId(tab)) return tab;
  switch (tab) {
    case "progress":
      return "accepted";
    case "ready":
      return "shipping";
    default:
      return "new";
  }
}

export function orderMatchesOwnerMobileOrdersTab(order: TabOrder, tab: StoreOrderTabId): boolean {
  return orderMatchesOwnerMobileOrdersTabId(order, effectiveOwnerMobileOrdersTab(tab));
}

export function orderMatchesOwnerMobileOrdersTabId(order: TabOrder, tab: OwnerMobileOrderTabId): boolean {
  if (tab === "every") return true;
  return ownerMobileOrdersTabForStatus(order.order_status, order.fulfillment_type ?? "local_delivery") === tab;
}

/** `order_id` 하이라이트·펼치기 시 URL `tab` 동기화 — 단계 위치(정본)로 결정 */
export function ownerMobileOrdersTabForStatus(
  orderStatus: string,
  fulfillment: string = "local_delivery"
): Exclude<OwnerMobileOrderTabId, "every"> {
  const s = orderStatus.trim();
  if (s === "refund_requested") return "refund";
  if (s === "cancelled" || s === "cancel_requested" || s === "refunded") return "cancelled";
  switch (orderStagePosition(s, fulfillment)) {
    case 0:
      return "new";
    case 1:
      return "accepted";
    case 2:
      return "preparing";
    case 3:
      return "shipping";
    case 4:
      return "done";
    default:
      return "new";
  }
}

/** `order_status` 가 C_store orderAttention(pending+refund+cancel) 에 속하는지 */
export function isOwnerOrderActionRequiredStatus(orderStatus: string): boolean {
  const s = orderStatus.trim();
  return (
    s === "pending" ||
    s === "cancel_requested" ||
    s === "cancelled" ||
    s === "refunded" ||
    s === "refund_requested"
  );
}

/** ops_attention 딥링크 — 건수 있는 탭(접수 대기 → 환불 요청 → 취소·환불) 선택 */
export function pickOwnerMobileOrdersTabForOpsAttention(orders: readonly TabOrder[]): OwnerMobileOrderTabId {
  let pending = 0;
  let refund = 0;
  let cancelledFamily = 0;
  for (const o of orders) {
    if (!isOwnerOrderActionRequiredStatus(o.order_status)) continue;
    const tab = ownerMobileOrdersTabForStatus(o.order_status, o.fulfillment_type ?? "local_delivery");
    if (tab === "new") pending += 1;
    else if (tab === "refund") refund += 1;
    else if (tab === "cancelled") cancelledFamily += 1;
  }
  if (pending > 0) return "new";
  if (refund > 0) return "refund";
  if (cancelledFamily > 0) return "cancelled";
  return "new";
}
