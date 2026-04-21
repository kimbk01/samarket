"use client";

import { useMemo } from "react";
import { getRecommendationReasonAnalytics } from "@/lib/recommendation-reports/mock-recommendation-reason-analytics";

interface RecommendationReasonAnalyticsTableProps {
  reportId: string;
  limit?: number;
}

export function RecommendationReasonAnalyticsTable({
  reportId,
  limit = 15,
}: RecommendationReasonAnalyticsTableProps) {
  const rows = useMemo(
    () => getRecommendationReasonAnalytics(reportId, limit),
    [reportId, limit]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        추천 이유 분석 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              순위
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              이유
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
              전환
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{r.rank}</td>
              <td className="px-3 py-2.5 text-sam-fg">{r.reasonLabel}</td>
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
                {r.conversionCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
