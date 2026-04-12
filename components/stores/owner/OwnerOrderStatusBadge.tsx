"use client";

import type { OwnerOrderStatus } from "@/lib/store-owner/types";

/** 배달K형 카드 뱃지 — 매장 주문 기준(`store-order-process-criteria`)과 톤 맞춤 */
const LABEL: Record<OwnerOrderStatus, string> = {
  pending: "신규",
  accepted: "주문확인",
  preparing: "상품준비",
  ready_for_pickup: "픽업준비",
  delivering: "배송중",
  arrived: "배송지도착",
  completed: "주문완료",
  cancel_requested: "취소요청",
  cancelled: "취소",
  refund_requested: "환불요청",
  refunded: "환불완료",
};

const CLS: Record<OwnerOrderStatus, string> = {
  pending: "bg-amber-100 text-amber-950 ring-amber-200",
  accepted: "bg-sky-100 text-sky-950 ring-sky-200",
  preparing: "bg-orange-100 text-orange-950 ring-orange-200",
  ready_for_pickup: "bg-indigo-100 text-indigo-950 ring-indigo-200",
  delivering: "bg-signature/10 text-sam-fg ring-sam-border",
  arrived: "bg-emerald-50 text-sam-fg ring-emerald-200",
  completed: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  cancel_requested: "bg-amber-200 text-amber-950 ring-amber-300",
  cancelled: "bg-sam-border-soft text-sam-fg ring-sam-border",
  refund_requested: "bg-red-100 text-red-900 ring-red-200",
  refunded: "bg-sam-surface-muted text-sam-fg ring-sam-border",
};

export function OwnerOrderStatusBadge({ status }: { status: OwnerOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${CLS[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
