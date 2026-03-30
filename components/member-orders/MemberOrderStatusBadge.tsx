"use client";

import type { MemberOrderStatus } from "@/lib/member-orders/types";

const LABEL: Record<MemberOrderStatus, string> = {
  pending: "접수됨",
  accepted: "주문확인",
  preparing: "상품준비",
  delivering: "배송중",
  ready_for_pickup: "픽업준비",
  arrived: "배송지도착",
  completed: "주문완료",
  cancelled: "취소됨",
  cancel_requested: "취소요청",
  refund_requested: "환불검토",
  refunded: "환불완료",
};

const CLS: Record<MemberOrderStatus, string> = {
  pending: "bg-amber-100 text-amber-950",
  accepted: "bg-sky-100 text-sky-950",
  preparing: "bg-orange-100 text-orange-950",
  delivering: "bg-signature/10 text-gray-900",
  ready_for_pickup: "bg-indigo-100 text-indigo-950",
  arrived: "bg-emerald-50 text-gray-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-gray-200 text-gray-800",
  cancel_requested: "bg-red-100 text-red-900",
  refund_requested: "bg-rose-100 text-rose-900",
  refunded: "bg-gray-100 text-gray-700",
};

export function MemberOrderStatusBadge({ status }: { status: MemberOrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CLS[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
