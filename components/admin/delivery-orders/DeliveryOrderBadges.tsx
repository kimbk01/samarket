"use client";

import type { AdminActionStatus, OrderStatus, PaymentStatus, SettlementStatus } from "@/lib/admin/delivery-orders-admin/types";
import { useDoAdminStatusLabels } from "./useDoAdminStatusLabels";

const base = "inline-block rounded px-2 py-0.5 sam-text-xxs font-semibold";

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { paymentStatus } = useDoAdminStatusLabels();
  const cls =
    status === "paid"
      ? "bg-emerald-50 text-emerald-800"
      : status === "refunded"
        ? "bg-signature/5 text-sam-fg"
        : status === "failed" || status === "cancelled"
          ? "bg-red-50 text-red-800"
          : "bg-sam-surface-muted text-sam-fg";
  return <span className={`${base} ${cls}`}>{paymentStatus(status)}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { orderStatus } = useDoAdminStatusLabels();
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800"
      : status === "cancelled" || status === "refunded"
        ? "bg-sam-surface-muted text-sam-fg"
        : status === "refund_requested" || status === "cancel_requested"
          ? "bg-amber-50 text-amber-900"
          : "bg-sky-50 text-sky-900";
  return <span className={`${base} ${cls}`}>{orderStatus(status)}</span>;
}

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const { settlementStatus } = useDoAdminStatusLabels();
  const cls =
    status === "paid"
      ? "bg-emerald-50 text-emerald-800"
      : status === "held"
        ? "bg-orange-50 text-orange-900"
        : status === "cancelled"
          ? "bg-sam-surface-muted text-sam-muted"
          : "bg-blue-50 text-blue-800";
  return <span className={`${base} ${cls}`}>{settlementStatus(status)}</span>;
}

export function AdminActionStatusBadge({ status }: { status: AdminActionStatus }) {
  const { adminAction } = useDoAdminStatusLabels();
  if (status === "none") return <span className="sam-text-xxs text-sam-meta">—</span>;
  const cls =
    status === "dispute_reviewing" || status === "manual_hold"
      ? "bg-orange-50 text-orange-900"
      : status === "refund_approved"
        ? "bg-signature/5 text-sam-fg"
        : "bg-sam-surface-muted text-sam-fg";
  return <span className={`${base} ${cls}`}>{adminAction(status)}</span>;
}
