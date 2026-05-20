/**
 * 매장 주문 프로세스 (사마켓: 앱 내 결제 없음 — 금액 수납은 고객·매장 직접 정산)
 *
 * - DB: store_orders.order_status 중심. payment_status 는 금액 확정·정산 호환용 메타에 가깝게 둠.
 * - 구매자 화면 상태 문구는 단일 표준으로 고정 (뱃지·목록·상세·채팅 등 BUYER_ORDER_STATUS_LABEL 참조).
 * - 배달 진행 스테퍼·채팅 진행 바: 4단계 — 주문접수 → 준비(조리)중 → 배달중 → 배달완료
 */

import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

/** 구매자 화면·알림용 상태 라벨 */
export const BUYER_ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "주문 확인중",
  accepted: "주문접수",
  preparing: "준비(조리)중",
  ready_for_pickup: "준비(조리)중",
  delivering: "배달중",
  arrived: "배송지 도착",
  completed: "배달완료",
  cancelled: "주문 취소",
  refund_requested: "환불요청",
  refunded: "환불완료",
};

/** 배달·택배 — 4단계 진행 스테퍼 (pending 은 1단계 대기, completed 는 4단계 종결) */
export const TIMELINE_DELIVERY_STEPS = [
  "주문접수",
  "준비(조리)중",
  "배달중",
  "배달완료",
] as const;

/** 픽업·포장 — 4단계 (배송 단계 없음) */
export const TIMELINE_PICKUP_STEPS = [
  "주문접수",
  "준비(조리)중",
  "픽업대기",
  "픽업완료",
] as const;

/**
 * 사장님·비즈 콘솔: 현재 상태 → 다음 상태로 보낼 때 버튼 문구
 */
export function labelForOwnerTransition(
  current: string,
  next: string,
  fulfillment: string
): string {
  void fulfillment;
  if (next === "accepted") return "주문접수";
  if (next === "preparing") return "준비(조리) 시작";
  if (next === "ready_for_pickup") return "준비 완료";
  if (next === "delivering") return "배달 시작";
  if (next === "arrived") return "배송지 도착";
  if (next === "completed") {
    return isDeliveryFulfillment(fulfillment) ? "배달완료" : "픽업완료";
  }
  if (next === "cancelled") {
    return current === "pending" ? "주문 거절" : "주문취소";
  }
  return next;
}

/**
 * 현재 진행 중인 타임라인 단계 인덱스 (0..n). completed면 n(=단계 수)과 같게 두고 UI에서 전체 완료 처리.
 * 배달 4열: pending … arrived → 인덱스 0..3, completed=4.
 * 픽업 4열: pending … ready_for_pickup → 인덱스 0..3, completed=4.
 */
export function storeOrderTimelineCurrentStep(fulfillmentType: string, orderStatus: string): number {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  if (deliveryLike) {
    const m: Record<string, number> = {
      pending: 0,
      accepted: 1,
      preparing: 2,
      ready_for_pickup: 2,
      delivering: 3,
      arrived: 3,
      completed: 4,
    };
    return m[orderStatus] ?? 0;
  }
  const m: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    ready_for_pickup: 3,
    completed: 4,
  };
  return m[orderStatus] ?? 0;
}

export type BuyerDetailStepState = "done" | "current" | "upcoming" | "na";

/** 주문 상세·채팅용 4단계 진행 상태 */
export function buyerDetailSixStepStates(
  fulfillmentType: string,
  orderStatus: string
): BuyerDetailStepState[] {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const u: BuyerDetailStepState = "upcoming";
  const d: BuyerDetailStepState = "done";
  const c: BuyerDetailStepState = "current";

  if (
    ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(orderStatus)
  ) {
    return [u, u, u, u];
  }

  if (deliveryLike) {
    switch (orderStatus) {
      case "pending":
        return [c, u, u, u];
      case "accepted":
        return [d, c, u, u];
      case "preparing":
      case "ready_for_pickup":
        return [d, d, c, u];
      case "delivering":
      case "arrived":
        return [d, d, d, c];
      case "completed":
        return [d, d, d, d];
      default:
        return [u, u, u, u];
    }
  }

  switch (orderStatus) {
    case "pending":
      return [c, u, u, u];
    case "accepted":
      return [d, c, u, u];
    case "preparing":
      return [d, d, c, u];
    case "ready_for_pickup":
      return [d, d, d, c];
    case "completed":
      return [d, d, d, d];
    default:
      return [u, u, u, u];
  }
}
