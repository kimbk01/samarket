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
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        추천 이유 분석 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              순위
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              이유
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              노출
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              클릭
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              전환
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">{r.rank}</td>
              <td className="px-3 py-2.5 text-gray-700">{r.reasonLabel}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {r.impressionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {r.clickCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(r.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {r.conversionCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
