"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberOrderStatus } from "@/lib/member-orders/types";

const STATUS_KEY: Record<MemberOrderStatus, MessageKey> = {
  pending: "member_order_status_pending",
  accepted: "member_order_status_accepted",
  preparing: "member_order_status_preparing",
  delivering: "member_order_status_delivering",
  ready_for_pickup: "member_order_status_ready_for_pickup",
  arrived: "member_order_status_arrived",
  completed: "member_order_status_completed",
  cancelled: "member_order_status_cancelled",
  cancel_requested: "member_order_status_cancel_requested",
  refund_requested: "member_order_status_refund_requested",
  refunded: "member_order_status_refunded",
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
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 sam-text-xxs font-bold ${CLS[status]}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}
