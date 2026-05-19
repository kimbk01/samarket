/**
 * 매장 오너 주문 목록 — 상단 탭(신규/진행중/완료/취소) 필터.
 * URL `tab` 과 정합 (`/my/business/store-orders?tab=...`).
 */

export type OwnerOrderMainTab = "new" | "progress" | "done" | "cancelled";

const KNOWN = new Set<string>(["new", "progress", "done", "cancelled"]);

export function parseOwnerOrderMainTab(raw: string | null | undefined): OwnerOrderMainTab {
  const t = (raw ?? "").trim();
  if (t && KNOWN.has(t)) return t as OwnerOrderMainTab;
  return "new";
}

export function orderMatchesOwnerMainTab(order: { order_status: string }, tab: OwnerOrderMainTab): boolean {
  const s = order.order_status;
  switch (tab) {
    case "new":
      return s === "pending";
    case "progress":
      return (
        s === "accepted" ||
        s === "preparing" ||
        s === "ready_for_pickup" ||
        s === "delivering" ||
        s === "arrived" ||
        s === "refund_requested"
      );
    case "done":
      return s === "completed";
    case "cancelled":
      return s === "cancelled" || s === "refunded";
    default:
      return true;
  }
}

export function countOrdersMatchingTab(
  orders: Array<{ order_status: string }>,
  tab: OwnerOrderMainTab
): number {
  let n = 0;
  for (const o of orders) {
    if (orderMatchesOwnerMainTab(o, tab)) n += 1;
  }
  return n;
}

/** 주문 상태 → 상단 탭(딥링크 `order_id` 복귀용) */
export function ownerOrderMainTabForStatus(orderStatus: string): OwnerOrderMainTab {
  const s = orderStatus.trim();
  if (s === "pending") return "new";
  if (s === "completed") return "done";
  if (s === "cancelled" || s === "refunded") return "cancelled";
  return "progress";
}
