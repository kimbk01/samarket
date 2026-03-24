"use client";

import { useMemo } from "react";
import { getRecommendationReportVersions } from "@/lib/recommendation-reports/mock-recommendation-report-versions";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

interface RecommendationVersionReportTableProps {
  reportId: string;
}

export function RecommendationVersionReportTable({
  reportId,
}: RecommendationVersionReportTableProps) {
  const versions = useMemo(
    () => getRecommendationReportVersions(reportId),
    [reportId]
  );

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        버전별 성과 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              노출 / 클릭
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              CTR / 전환율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              배포 상태 / Live
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const version = getFeedVersionById(v.versionId);
            return (
              <tr
                key={v.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {SURFACE_LABELS[v.surface]}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {version?.versionName ?? v.versionId}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {v.impressionCount.toLocaleString()} / {v.clickCount.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(v.ctr * 100).toFixed(2)}% / {(v.conversionRate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {v.deploymentStatus} {v.isLiveVersion ? "· Live" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
