"use client";

import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";

const SURFACE_LABELS: Record<string, string> = {
  home: "홈",
  search: "검색",
  shop: "상점",
};

interface RecommendationPerformanceTableProps {
  summaries: RecommendationAnalyticsSummary[];
}

export function RecommendationPerformanceTable({
  summaries,
}: RecommendationPerformanceTableProps) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        추천 성과 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              노출
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              클릭
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              전환
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              전환률
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대표 사유
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr
              key={s.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {SURFACE_LABELS[s.surface] ?? s.surface}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {s.sectionKey}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{s.impressionCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.clickCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.conversionCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(s.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(s.conversionRate * 100).toFixed(2)}%
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.topReason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
