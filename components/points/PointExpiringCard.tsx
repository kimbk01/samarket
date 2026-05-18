"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
      href="/my/points/expiring"
      className={`block rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4 ${className}`}
    >
      <p className="sam-text-body-secondary text-amber-800">{t("points_ui_expiring_label")}</p>
      <p className="mt-1 sam-text-page-title font-bold text-amber-900">
        {summary.totalExpiringPoint.toLocaleString()}P
      </p>
      {summary.nearestExpireAt && (
        <p className="mt-1 sam-text-helper text-amber-700">
          {t("points_ui_nearest_expire")}{" "}
          {new Date(summary.nearestExpireAt).toLocaleDateString("ko-KR")}
        </p>
      )}
      <p className="mt-2 sam-text-helper text-amber-600">{t("points_ui_view_details")}</p>
    </Link>
  );
}
