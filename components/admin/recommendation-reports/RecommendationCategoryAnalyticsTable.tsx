"use client";

import { useMemo } from "react";
import { getRecommendationCategoryAnalytics } from "@/lib/recommendation-reports/mock-recommendation-category-analytics";

interface RecommendationCategoryAnalyticsTableProps {
  reportId: string;
}

export function RecommendationCategoryAnalyticsTable({
  reportId,
}: RecommendationCategoryAnalyticsTableProps) {
  const rows = useMemo(
    () => getRecommendationCategoryAnalytics(reportId),
    [reportId]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        카테고리별 성과 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              노출
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              클릭
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              전환 / 전환율
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.category}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.impressionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.clickCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(r.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.conversionCount} ({(r.conversionRate * 100).toFixed(2)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
