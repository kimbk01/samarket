"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import type { PointExpireUpcomingSummary } from "@/lib/types/point-expire";

interface PointExpiringCardProps {
  summary: PointExpireUpcomingSummary;
  className?: string;
}

export function PointExpiringCard({ summary, className = "" }: PointExpiringCardProps) {
  const { t } = useI18n();

  if (summary.totalExpiringPoint <= 0) return null;

  return (
    <Link
      href="/mypage/points/expiring"
      className={`currency-card--point block rounded-ui-rect border p-4 ${className}`}
    >
      <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_expiring_label")}</p>
      <CurrencyAmount
        currency="point"
        amount={summary.totalExpiringPoint}
        compactPoint
        className="mt-1 sam-text-page-title"
      />
      {summary.nearestExpireAt && (
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("points_ui_nearest_expire")}{" "}
          {new Date(summary.nearestExpireAt).toLocaleDateString("ko-KR")}
        </p>
      )}
      <p className="currency-amount--point mt-2 sam-text-helper">{t("points_ui_view_details")}</p>
    </Link>
  );
}
