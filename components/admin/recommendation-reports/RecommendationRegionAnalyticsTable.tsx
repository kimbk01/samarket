"use client";

import { useMemo } from "react";
import { getRecommendationRegionAnalytics } from "@/lib/recommendation-reports/mock-recommendation-region-analytics";

interface RecommendationRegionAnalyticsTableProps {
  reportId: string;
}

export function RecommendationRegionAnalyticsTable({
  reportId,
}: RecommendationRegionAnalyticsTableProps) {
  const rows = useMemo(
    () => getRecommendationRegionAnalytics(reportId),
    [reportId]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        지역별 성과 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              지역 / 시·구
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
              전환율
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {r.region} {r.city}
                {r.barangay ? ` · ${r.barangay}` : ""}
              </td>
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
                {(r.conversionRate * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
