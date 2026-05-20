import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

/** 메신저 배달 주문 채팅 — 배달 운영형 전체 흐름 */
export const MESSENGER_DELIVERY_PROGRESS_STEPS = [
  "신규주문",
  "주문접수",
  "조리중",
  "배달준비",
  "배달중",
  "주소근처",
  "완료",
] as const;

/** 메신저 픽업 주문 채팅 — 배달 단계 없이 분리 */
export const MESSENGER_PICKUP_PROGRESS_STEPS = [
  "신규주문",
  "주문접수",
  "조리중",
  "픽업준비",
  "수령완료",
] as const;

const TERMINAL_FAIL_STATUSES = new Set([
  "cancelled",
  "cancel_requested",
  "refund_requested",
  "refunded",
]);

/**
 * 진행 라벨에서 강조할 현재 단계 인덱스 (0..steps-1).
 * `store_orders.order_status` · fulfillment_type 과 동일 매핑.
 */
export function messengerDeliveryProgressCurrentStep(
  orderStatus: string,
  fulfillmentType: string
): number {
  const status = orderStatus.trim() || "pending";
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  if (deliveryLike) {
    if (status === "pending") return 0;
    if (status === "accepted") return 1;
    if (status === "preparing") return 2;
    if (status === "ready_for_pickup") return 3;
    if (status === "delivering") return 4;
    if (status === "arrived") return 5;
    if (status === "completed") return 6;
    return 0;
  }
  if (status === "pending") return 0;
  if (status === "accepted") return 1;
  if (status === "preparing") return 2;
  if (status === "ready_for_pickup") return 3;
  if (status === "completed") return 4;
  return 0;
}

/**
 * 진행 바 채움 비율(0~1) — 현재 단계를 마친 뒤 **다음 단계 직전**까지.
 */
export function messengerDeliveryProgressFillRatio(
  orderStatus: string,
  fulfillmentType: string
): number {
  const status = orderStatus.trim() || "pending";
  if (TERMINAL_FAIL_STATUSES.has(status)) return 0;
  if (status === "completed") return 1;
  const steps = isDeliveryFulfillment(fulfillmentType)
    ? MESSENGER_DELIVERY_PROGRESS_STEPS
    : MESSENGER_PICKUP_PROGRESS_STEPS;
  const lastIndex = Math.max(1, steps.length - 1);
  const current = messengerDeliveryProgressCurrentStep(status, fulfillmentType);
  return Math.min(1, Math.max(0, current / lastIndex));
}

export function messengerDeliveryProgressSteps(fulfillmentType: string): readonly string[] {
  return isDeliveryFulfillment(fulfillmentType)
    ? MESSENGER_DELIVERY_PROGRESS_STEPS
    : MESSENGER_PICKUP_PROGRESS_STEPS;
}
