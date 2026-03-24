/**
 * 매장 주문 프로세스 (사마켓: 앱 내 결제 없음 — 금액 수납은 고객·매장 직접 정산)
 *
 * - DB: store_orders.order_status 중심. payment_status 는 금액 확정·정산 호환용 메타에 가깝게 둠.
 * - 채팅: chat_rooms(room_type=store_order) + 시스템 메시지(appendStoreOrderChatStatusTransition 등)
 *
 * 흐름(통일 기준):
 * - 주문자: 주문하기 → 이후 매장 처리 단계는 아래 타임라인과 동일한 이름으로 안내
 * - 배달·택배: 주문확인 → 상품준비 → 픽업준비 → 배송중 → 배송지도착 → 주문완료
 * - 픽업·포장: 주문확인 → 상품준비 → 픽업준비 → 주문완료 (배송 단계 생략)
 */

import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

/** 구매자 화면·알림용 상태 라벨 */
export const BUYER_ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "주문 확인 대기",
  accepted: "주문확인",
  preparing: "상품준비",
  ready_for_pickup: "픽업준비",
  delivering: "배송중",
  arrived: "배송지도착",
  completed: "주문완료",
  cancelled: "주문 취소",
  refund_requested: "환불 요청",
  refunded: "환불 완료",
};

/** 배달·택배 — 6단계 (주문하기 이후 매장·배송 처리) */
export const TIMELINE_DELIVERY_STEPS = [
  "주문확인",
  "상품준비",
  "픽업준비",
  "배송중",
  "배송지도착",
  "주문완료",
] as const;

/** 픽업·포장 — 4단계 (배송 단계 없음) */
export const TIMELINE_PICKUP_STEPS = ["주문확인", "상품준비", "픽업준비", "주문완료"] as const;

/**
 * 사장님·비즈 콘솔: 현재 상태 → 다음 상태로 보낼 때 버튼 문구
 */
export function labelForOwnerTransition(
  current: string,
  next: string,
  fulfillment: string
): string {
  if (next === "accepted") return "주문확인";
  if (next === "preparing") return "상품준비";
  if (next === "ready_for_pickup") return "픽업준비";
  if (next === "delivering") return "배송중";
  if (next === "arrived") return "배송지도착";
  if (next === "completed") return "주문완료";
  if (next === "cancelled") {
    return current === "pending" ? "주문 거절" : "주문 취소";
  }
  return next;
}

/**
 * 현재 진행 중인 타임라인 단계 인덱스 (0..n). completed면 n(=단계 수)과 같게 두고 UI에서 전체 완료 처리.
 * 배달 6단계: pending=0(주문확인 대기) … arrived=5(주문완료 대기), completed=6.
 * 픽업 4단계: pending=0 … ready_for_pickup=2(픽업준비 진행), completed=4(전체 완료는 UI에서 allDone 처리).
 */
export function storeOrderTimelineCurrentStep(fulfillmentType: string, orderStatus: string): number {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  if (deliveryLike) {
    const m: Record<string, number> = {
      pending: 0,
      accepted: 1,
      preparing: 2,
      ready_for_pickup: 3,
      delivering: 4,
      arrived: 5,
      completed: 6,
    };
    return m[orderStatus] ?? 0;
  }
  const m: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    ready_for_pickup: 2,
    completed: 4,
  };
  return m[orderStatus] ?? 0;
}

export type BuyerDetailStepState = "done" | "current" | "upcoming" | "na";

/** 주문 상세용 6단계 — 픽업·포장은 배송 단계(3,4)를 생략 행으로 표시 */
export function buyerDetailSixStepStates(
  fulfillmentType: string,
  orderStatus: string
): BuyerDetailStepState[] {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const na: BuyerDetailStepState = "na";
  const u: BuyerDetailStepState = "upcoming";
  const d: BuyerDetailStepState = "done";
  const c: BuyerDetailStepState = "current";

  if (
    ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(orderStatus)
  ) {
    return [u, u, u, na, na, u];
  }

  if (deliveryLike) {
    switch (orderStatus) {
      case "pending":
        return [c, u, u, u, u, u];
      case "accepted":
        return [d, c, u, u, u, u];
      case "preparing":
        return [d, d, c, u, u, u];
      case "ready_for_pickup":
        return [d, d, d, c, u, u];
      case "delivering":
        return [d, d, d, d, c, u];
      case "arrived":
        return [d, d, d, d, d, c];
      case "completed":
        return [d, d, d, d, d, d];
      default:
        return [u, u, u, u, u, u];
    }
  }

  switch (orderStatus) {
    case "pending":
      return [c, u, u, na, na, u];
    case "accepted":
      return [d, c, u, na, na, u];
    case "preparing":
      return [d, d, c, na, na, u];
    case "ready_for_pickup":
      return [d, d, d, na, na, c];
    case "completed":
      return [d, d, d, na, na, d];
    default:
      return [u, u, u, na, na, u];
  }
}
