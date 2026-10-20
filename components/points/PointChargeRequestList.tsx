"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
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

/** 상태 뱃지 — sam 토큰만 (C.0.2 색 규칙) */
const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_confirm: "bg-sam-warning-soft text-sam-warning",
  on_hold: "bg-sam-border-soft text-sam-muted",
  approved: "bg-sam-success-soft text-sam-success",
  rejected: "bg-sam-danger-soft text-sam-danger",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointChargeRequestList({
  requests,
  onCancel,
}: PointChargeRequestListProps) {
  const { t, language } = useI18n();

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
            <span>{formatMypageMoney(r.paymentAmount)} →</span>
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
              className={`inline-block rounded-full px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[r.requestStatus]}`}
            >
              {t(STATUS_KEYS[r.requestStatus])}
            </span>
          </div>
          <p className="mt-1 sam-text-helper text-sam-meta">
            {formatMypageDate(r.requestedAt, { style: "datetime", lang: language })}
          </p>
          {onCancel && ["pending", "waiting_confirm"].includes(r.requestStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              className="mt-2 min-h-[44px] sam-text-body-secondary font-semibold text-sam-danger hover:underline"
            >
              {t("points_ui_cancel_request")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
