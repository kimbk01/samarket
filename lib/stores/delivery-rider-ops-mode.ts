/**
 * DLV-01 / D-6 — the live delivery model is store self-delivery. The rider stack (delivery_riders,
 * store_order_deliveries, rider API, POD) stays in code but is not operated while no rider is registered.
 * Admin rider screens show this state instead of presenting the menu as a running operation.
 */
export type DeliveryRiderOpsMode = "self_delivery_only" | "rider_ops";

export function deliveryRiderOpsMode(ridersTotal: number | null | undefined): DeliveryRiderOpsMode | null {
  if (ridersTotal == null || !Number.isFinite(Number(ridersTotal))) return null;
  return Number(ridersTotal) <= 0 ? "self_delivery_only" : "rider_ops";
}

export function deliveryRiderOpsModeNotice(mode: DeliveryRiderOpsMode | null, ko: boolean): string | null {
  if (mode !== "self_delivery_only") return null;
  return ko
    ? "미운영 — 배달 주체: 매장 자체배달 (등록 라이더 0명). 주문 진행은 매장이 주문 상태로 처리하며, 이 화면의 배차 기능은 라이더 도입 전까지 사용되지 않습니다."
    : "Not operated — deliveries are done by the stores themselves (0 registered riders). Stores move orders through order status; dispatch tools here stay unused until riders are introduced.";
}
