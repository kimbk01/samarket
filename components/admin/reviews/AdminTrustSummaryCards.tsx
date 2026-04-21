"use client";

import type { AdminTrustSummary } from "@/lib/types/admin-review";
import { AdminCard } from "@/components/admin/AdminCard";
import { mannerRawToPercent } from "@/lib/trust/manner-battery";

interface AdminTrustSummaryCardsProps {
  summary: AdminTrustSummary;
}

export function AdminTrustSummaryCards({ summary }: AdminTrustSummaryCardsProps) {
  const items = [
    { label: "후기 수", value: summary.reviewCount },
    { label: "평균 평점", value: summary.averageRating.toFixed(1) },
    {
      label: "배터리",
      value: `${mannerRawToPercent(summary.mannerScore)}%`,
    },
    { label: "긍정", value: summary.positiveCount },
    { label: "부정", value: summary.negativeCount },
    { label: "숨김 후기", value: summary.hiddenReviewCount },
  ];

  return (
    <AdminCard title={`신뢰도 요약: ${summary.nickname} (${summary.userId})`}>
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
