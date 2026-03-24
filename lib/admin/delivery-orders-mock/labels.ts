import type { AdminActionStatus, OrderStatus, PaymentStatus, SettlementStatus } from "./types";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "결제 대기",
  paid: "결제완료",
  failed: "결제 실패",
  cancelled: "결제 취소",
  refunded: "환불 완료",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "접수 대기",
  accepted: "주문확인",
  preparing: "상품준비",
  ready_for_pickup: "픽업준비",
  delivering: "배송중",
  arrived: "배송지도착",
  completed: "주문완료",
  cancel_requested: "취소 요청",
  cancelled: "주문 취소",
  refund_requested: "환불 요청",
  refunded: "환불됨",
};

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  scheduled: "정산 예정",
  processing: "정산 처리중",
  paid: "정산 완료",
  held: "정산 보류",
  cancelled: "정산 취소",
};

export const ADMIN_ACTION_LABEL: Record<AdminActionStatus, string> = {
  none: "—",
  manual_hold: "수동 보류",
  admin_cancelled: "관리자 취소",
  dispute_reviewing: "분쟁 검토",
  refund_approved: "환불 승인 처리",
  refund_rejected: "환불 거절",
};
