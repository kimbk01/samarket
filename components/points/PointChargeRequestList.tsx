"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointChargeRequest, PointChargeRequestStatus, PointPaymentMethod } from "@/lib/types/point";

const STATUS_KEYS: Record<PointChargeRequestStatus, MessageKey> = {
  pending: "point_status_pending",
  waiting_confirm: "point_status_waiting_confirm",
  on_hold: "point_status_on_hold",
  approved: "point_status_approved",
  rejected: "point_status_rejected",
  cancelled: "point_status_cancelled",
};

const PAYMENT_KEYS: Record<PointPaymentMethod, MessageKey> = {
  bank_transfer: "point_pay_bank_transfer",
  gcash: "point_pay_manual_confirm",
  manual_confirm: "point_pay_manual_confirm",
};

interface PointChargeRequestListProps {
  requests: PointChargeRequest[];
  onCancel?: (id: string) => void;
}

const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-sam-border-soft text-sam-muted",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointChargeRequestList({
  requests,
  onCancel,
}: PointChargeRequestListProps) {
  const { t } = useI18n();

  const handleCancel = (id: string) => {
    onCancel?.(id);
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {t("points_ui_no_charge_requests")}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{r.planName}</p>
          <div className="mt-0.5 flex items-center gap-1 sam-text-body-secondary text-sam-muted">
            <span>₱{r.paymentAmount.toLocaleString()} →</span>
            <CurrencyAmount
              currency="point"
              amount={r.pointAmount}
              compactPoint
              className="sam-text-body-secondary"
            />
          </div>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {r.paymentMethod === "gcash" ? "GCash" : t(PAYMENT_KEYS[r.paymentMethod])}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[r.requestStatus]}`}
            >
              {t(STATUS_KEYS[r.requestStatus])}
            </span>
          </div>
          <p className="mt-1 sam-text-helper text-sam-meta">
            {new Date(r.requestedAt).toLocaleString("ko-KR")}
          </p>
          {onCancel && ["pending", "waiting_confirm"].includes(r.requestStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              className="mt-2 sam-text-body-secondary text-red-600 hover:underline"
            >
              {t("points_ui_cancel_request")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
