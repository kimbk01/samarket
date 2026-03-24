/**
 * 매장이 아직 접수하지 않은 주문 — 구매자가 접수 전 취소 가능한지 등에 사용.
 * (실제 금액 수납은 앱 밖에서 진행하므로 payment_status와 무관)
 */
export function storeOrderAwaitingFirstPayment(order: {
  payment_status: string;
  order_status: string;
}): boolean {
  void order.payment_status;
  return order.order_status === "pending";
}
