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
          <div key={label} className="rounded border border-gray-100 bg-gray-50 p-3">
            <p className="text-[12px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-[15px] font-medium text-gray-900">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-gray-500">
        갱신: {new Date(summary.updatedAt).toLocaleString("ko-KR")}
      </p>
    </AdminCard>
  );
}
