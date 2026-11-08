"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminTrustSummary } from "@/lib/types/admin-review";
import { AdminCard } from "@/components/admin/AdminCard";
import { mannerRawToPercent } from "@/lib/trust/manner-battery";

interface AdminTrustSummaryCardsProps {
  summary: AdminTrustSummary;
}

export function AdminTrustSummaryCards({ summary }: AdminTrustSummaryCardsProps) {
  const { t } = useI18n();
  const items = [
    { label: t("admin_reviews_trust_review_count"), value: summary.reviewCount },
    { label: t("admin_reviews_trust_avg_rating"), value: summary.averageRating.toFixed(1) },
    {
      label: t("admin_reviews_trust_battery"),
      value: `${mannerRawToPercent(summary.mannerScore)}%`,
    },
    { label: t("admin_reviews_trust_positive"), value: summary.positiveCount },
    { label: t("admin_reviews_trust_negative"), value: summary.negativeCount },
    { label: t("admin_reviews_trust_hidden"), value: summary.hiddenReviewCount },
  ];

  return (
    <AdminCard title={t("admin_reviews_trust_summary_title", { nickname: summary.nickname, userId: summary.userId })}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ label, value }) => (
          <div key={label} className="rounded border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper text-sam-muted">{label}</p>
            <p className="mt-0.5 sam-text-body font-medium text-sam-fg">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">
        갱신: {new Date(summary.updatedAt).toLocaleString("ko-KR")}
      </p>
    </AdminCard>
  );
}
