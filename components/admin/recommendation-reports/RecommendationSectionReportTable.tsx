"use client";

import { useMemo } from "react";
import { getRecommendationReportSections } from "@/lib/recommendation-reports/mock-recommendation-report-sections";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { SectionHealthStatus } from "@/lib/types/recommendation-report";

interface RecommendationSectionReportTableProps {
  reportId: string;
}

const STATUS_LABELS: Record<SectionHealthStatus, string> = {
  healthy: "정상",
  warning: "경고",
  critical: "위험",
};

export function RecommendationSectionReportTable({
  reportId,
}: RecommendationSectionReportTableProps) {
  const sections = useMemo(
    () => getRecommendationReportSections(reportId),
    [reportId]
  );

  if (sections.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        섹션 성과 데이터가 없습니다.
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
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              전환
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr
              key={s.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {SURFACE_LABELS[s.surface]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">{s.sectionKey}</td>
              <td className="px-3 py-2.5 text-gray-700">
                {s.impressionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {s.clickCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(s.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {s.conversionCount}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                    s.status === "healthy"
                      ? "bg-emerald-50 text-emerald-800"
                      : s.status === "warning"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  {STATUS_LABELS[s.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
