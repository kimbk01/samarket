import type { MemberOrderStatus, PaymentStatus } from "./types";

/** 회원 노출용 한 줄 안내 */
export const MEMBER_STATUS_USER_MESSAGE: Record<MemberOrderStatus, string> = {
  pending: "주문이 접수되었어요",
  accepted: "주문확인이 완료되었어요",
  preparing: "상품을 준비하고 있어요",
  delivering: "배송 중이에요",
  ready_for_pickup: "픽업 준비가 되었어요",
  arrived: "배송지에 도착했어요",
  completed: "주문이 완료되었어요",
  cancelled: "주문이 취소되었어요",
  cancel_requested: "취소 요청이 접수되었어요",
  refund_requested: "환불 검토중이에요",
  refunded: "환불이 완료되었어요",
};

export const MEMBER_PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  failed: "결제 실패",
  cancelled: "결제 취소",
  refunded: "환불 완료",
};
