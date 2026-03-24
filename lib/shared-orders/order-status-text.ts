import type { SharedOrderStatus } from "./types";

type Role = "member" | "owner" | "admin";

const MEMBER: Record<SharedOrderStatus, string> = {
  pending: "주문이 접수되었어요",
  accepted: "매장에서 주문을 확인했어요",
  preparing: "음식을 준비하고 있어요",
  delivering: "배송 중이에요",
  ready_for_pickup: "픽업 준비가 되었어요",
  arrived: "배송지에 도착했어요",
  completed: "주문이 완료되었어요",
  cancelled: "주문이 취소되었어요",
  cancel_requested: "취소 요청이 접수되었어요",
  refund_requested: "환불 검토중이에요",
  refunded: "환불이 완료되었어요",
};

const OWNER: Record<SharedOrderStatus, string> = {
  pending: "신규 주문이 들어왔어요",
  accepted: "접수 완료 — 조리를 시작해 주세요",
  preparing: "현재 조리중",
  delivering: "배송 중",
  ready_for_pickup: "픽업 준비",
  arrived: "배송지 도착",
  completed: "주문 완료",
  cancelled: "주문 취소됨",
  cancel_requested: "고객 취소 요청 — 확인 필요",
  refund_requested: "환불·문제 검토 요청",
  refunded: "환불 완료",
};

const ADMIN: Record<SharedOrderStatus, string> = {
  pending: "주문 접수(pending)",
  accepted: "접수 완료(accepted)",
  preparing: "조리중(preparing)",
  delivering: "배송중(delivering)",
  ready_for_pickup: "픽업준비(ready_for_pickup)",
  arrived: "배송지도착(arrived)",
  completed: "주문완료(completed)",
  cancelled: "취소(cancelled)",
  cancel_requested: "취소 승인 대기(cancel_requested)",
  refund_requested: "환불 검토(refund_requested)",
  refunded: "환불됨(refunded)",
};

export function orderStatusTextForRole(status: SharedOrderStatus, role: Role): string {
  if (role === "member") return MEMBER[status];
  if (role === "owner") return OWNER[status];
  return ADMIN[status];
}
