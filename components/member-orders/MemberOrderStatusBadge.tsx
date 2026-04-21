"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  delivering: "bg-signature/10 text-sam-fg",
  ready_for_pickup: "bg-indigo-100 text-indigo-950",
  arrived: "bg-emerald-50 text-sam-fg",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-sam-border-soft text-sam-fg",
  cancel_requested: "bg-red-100 text-red-900",
  refund_requested: "bg-rose-100 text-rose-900",
  refunded: "bg-sam-surface-muted text-sam-fg",
};

export function MemberOrderStatusBadge({ status }: { status: MemberOrderStatus }) {
  const { tt } = useI18n();
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 sam-text-xxs font-bold ${CLS[status]}`}
    >
      {tt(LABEL[status])}
    </span>
  );
}
