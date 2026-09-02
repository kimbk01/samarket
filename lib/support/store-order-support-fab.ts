const PROBLEM_ORDER_STATUSES = new Set([
  "refund_requested",
  "cancelled",
  "refund_rejected",
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
