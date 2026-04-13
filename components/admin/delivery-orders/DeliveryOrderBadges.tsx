"use client";

import type { AdminActionStatus, OrderStatus, PaymentStatus, SettlementStatus } from "@/lib/admin/delivery-orders-admin/types";
import {
  ADMIN_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_LABEL,
  SETTLEMENT_LABEL,
} from "@/lib/admin/delivery-orders-admin/labels";

const base = "inline-block rounded px-2 py-0.5 text-[11px] font-semibold";

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cls =
    status === "paid"
      ? "bg-emerald-50 text-emerald-800"
      : status === "refunded"
        ? "bg-signature/5 text-sam-fg"
        : status === "failed" || status === "cancelled"
          ? "bg-red-50 text-red-800"
          : "bg-sam-surface-muted text-sam-fg";
  return <span className={`${base} ${cls}`}>{PAYMENT_LABEL[status]}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800"
      : status === "cancelled" || status === "refunded"
        ? "bg-sam-surface-muted text-sam-fg"
        : status === "refund_requested" || status === "cancel_requested"
          ? "bg-amber-50 text-amber-900"
          : "bg-sky-50 text-sky-900";
  return <span className={`${base} ${cls}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const cls =
    status === "paid"
      ? "bg-emerald-50 text-emerald-800"
      : status === "held"
        ? "bg-orange-50 text-orange-900"
        : status === "cancelled"
          ? "bg-sam-surface-muted text-sam-muted"
          : "bg-blue-50 text-blue-800";
  return <span className={`${base} ${cls}`}>{SETTLEMENT_LABEL[status]}</span>;
}

export function AdminActionStatusBadge({ status }: { status: AdminActionStatus }) {
  if (status === "none") return <span className="text-[11px] text-sam-meta">—</span>;
  const cls =
    status === "dispute_reviewing" || status === "manual_hold"
      ? "bg-orange-50 text-orange-900"
      : status === "refund_approved"
        ? "bg-signature/5 text-sam-fg"
        : "bg-sam-surface-muted text-sam-fg";
  return <span className={`${base} ${cls}`}>{ADMIN_ACTION_LABEL[status]}</span>;
}
