"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { FinanceStatusBadge } from "@/components/finance/FinanceStatusBadge";
import {
  financePaymentMethodDisplay,
  financeRefNo,
  pointChargeStatusDisplay,
} from "@/lib/finance/finance-display-labels";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
import type { PointChargeRequest } from "@/lib/types/point";
import { pointChargeProcessedStamp } from "@/lib/points/point-charge-request-display";

interface PointChargeRequestListProps {
  requests: PointChargeRequest[];
  onCancel?: (id: string) => void;
}

export function PointChargeRequestList({
  requests,
  onCancel,
}: PointChargeRequestListProps) {
  const { t, safeT, language } = useI18n();

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
      {requests.map((r) => {
        const stamp = pointChargeProcessedStamp(r);
        const method = financePaymentMethodDisplay(r.paymentMethod);
        const refNo = financeRefNo(r.id);
        return (
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
            {method ? safeT(method.key, { fallbackKo: method.ko, fallbackEn: method.en }) : null}
            {refNo ? (
              <span className="ml-1 tabular-nums text-sam-meta" data-point-charge-ref-no="1">
                {refNo}
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <FinanceStatusBadge label={pointChargeStatusDisplay(r.requestStatus)} />
          </div>
          {/* 신청·처리 두 시각 (설계 §2-2) — 처리 시각 = processed_at, 없으면 approved_at */}
          <p className="mt-1 sam-text-helper text-sam-meta" data-point-charge-requested-at="1">
            {language === "en" ? "Requested" : "신청"} {formatMypageDate(r.requestedAt, { style: "datetime", lang: language })}
            {stamp?.kind === "processed" ? (
              <span data-point-charge-processed-at="1">
                {" · "}
                {language === "en" ? "Processed" : "처리"}{" "}
                {formatMypageDate(stamp.at, { style: "datetime", lang: language })}
              </span>
            ) : null}
          </p>
          {/* 취소 시각 — 신청·처리 시각과 같은 표기(필리핀 시간 고정 · 실기 발견 결함 4 — 이전: 이 줄만 다른 형식) */}
          {stamp?.kind === "cancelled" ? (
            <p className="mt-0.5 sam-text-helper text-sam-meta" data-point-charge-cancelled-at="1">
              {language === "en" ? "Cancelled" : "취소"} {formatMypageDate(stamp.at, { style: "datetime", lang: language })}
            </p>
          ) : null}
          {r.requestStatus === "rejected" && r.rejectReason ? (
            <p className="mt-1 sam-text-helper text-sam-danger" data-point-charge-reject-reason="1">
              {language === "en" ? "Reason" : "반려 사유"}: {r.rejectReason}
            </p>
          ) : null}
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
        );
      })}
    </ul>
  );
}
