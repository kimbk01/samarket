/**
 * FLW-05 — 실제 `order_status` 값만. 취소 요청 대기(cancel_requested)는 분쟁 진행 중이라 포함,
 * 존재하지 않는 "refund_rejected" 는 제외 (반려는 이전 진행 상태로 돌아가며 알림으로만 구분).
 */
const PROBLEM_ORDER_STATUSES = new Set([
  "cancel_requested",
  "refund_requested",
  "cancelled",
]);

/** Whether store order detail should show Support FAB (explicit business state, not URL). */
export function shouldEnableStoreOrderSupportFab(order: {
  order_status?: string | null;
  payment_status?: string | null;
}): boolean {
  const status = String(order.order_status ?? "").trim();
  const payment = String(order.payment_status ?? "").trim();
  if (PROBLEM_ORDER_STATUSES.has(status)) return true;
  if (payment === "refunded" || payment === "failed") return true;
  return false;
}
