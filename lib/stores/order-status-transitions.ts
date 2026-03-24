/** DB `store_orders_order_status_check` 및 운영 문서와 동일 순서·집합 유지 */
export const STORE_ORDER_STATUS_LIST = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancelled",
  "refund_requested",
  "refunded",
] as const;

export type StoreOrderStatus = (typeof STORE_ORDER_STATUS_LIST)[number];

const VALID = new Set<string>(STORE_ORDER_STATUS_LIST);

/** 동네배달·택배 — 픽업과 다른 전이(배송중 이후) */
export function isDeliveryFulfillment(fulfillment: string): boolean {
  return fulfillment === "local_delivery" || fulfillment === "shipping";
}

export function isValidOrderStatus(s: string): boolean {
  return VALID.has(s);
}

/**
 * 오너가 설정할 수 있는 다음 상태 (fulfillment에 따라 분기)
 * 배달: preparing→ready_for_pickup(픽업준비)→delivering→arrived→completed
 * 픽업: preparing→ready_for_pickup→completed
 */
export function allowedOrderTransitions(current: string, fulfillment: string): string[] {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  switch (current) {
    case "pending":
      return ["accepted", "cancelled"];
    case "accepted":
      return ["preparing", "cancelled"];
    case "preparing":
      return ["ready_for_pickup", "cancelled"];
    case "ready_for_pickup":
      if (deliveryLike) return ["delivering", "cancelled"];
      return ["completed", "cancelled"];
    case "delivering":
      return ["arrived", "cancelled"];
    case "arrived":
      return ["completed", "cancelled"];
    default:
      return [];
  }
}

export function shouldRestoreStockOnCancel(prevStatus: string): boolean {
  return ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"].includes(
    prevStatus
  );
}

/** 레거시: 시스템 결제 게이트 없음 — 항상 허용 목록 그대로 반환 */
export function filterTransitionsByPayment(
  allowed: string[],
  _current: string,
  _paymentStatus: string
): string[] {
  return allowed;
}

/** 결제 완료 후·완료 전 구매자 환불 요청 가능한 주문 진행 상태 */
const BUYER_REFUND_REQUEST_STATUSES = new Set([
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
]);

export function canBuyerRequestStoreRefund(orderStatus: string, paymentStatus: string): boolean {
  if (!BUYER_REFUND_REQUEST_STATUSES.has(orderStatus)) return false;
  return paymentStatus !== "cancelled" && paymentStatus !== "refunded";
}

/** 주문 취소 완료 후 구매자 주문 채팅 진입 비활성화 */
export function isStoreOrderChatDisabledForBuyer(orderStatus: string): boolean {
  return orderStatus === "cancelled";
}
