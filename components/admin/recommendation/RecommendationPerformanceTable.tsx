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
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        추천 성과 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              섹션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              노출
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              클릭
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              전환
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              전환률
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대표 사유
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr
              key={s.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[s.surface] ?? s.surface}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {s.sectionKey}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{s.impressionCount}</td>
              <td className="px-3 py-2.5 text-gray-700">{s.clickCount}</td>
              <td className="px-3 py-2.5 text-gray-700">{s.conversionCount}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {(s.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(s.conversionRate * 100).toFixed(2)}%
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                {s.topReason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
