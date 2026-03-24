"use client";

import { useMemo, useState } from "react";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-monitoring/mock-recommendation-health-statuses";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { HealthStatus } from "@/lib/types/recommendation-monitoring";

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "정상",
  warning: "경고",
  critical: "위험",
};

export function SurfaceHealthTable() {
  const [refresh, setRefresh] = useState(0);
  const statuses = useMemo(
    () => getRecommendationHealthStatuses(),
    [refresh]
  );

  if (statuses.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        헬스 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              성공률
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              빈피드율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              Fallback
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              킬스위치
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              평균 CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              live 버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              최근 배포 상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              확인 시각
            </th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => {
            const version = s.liveVersionId
              ? getFeedVersionById(s.liveVersionId)
              : null;
            return (
              <tr
                key={s.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {SURFACE_LABELS[s.surface]}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
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
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.successRate * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.emptyFeedRate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2.5">
                  {s.fallbackActive ? (
                    <span className="text-[13px] text-amber-600">ON</span>
                  ) : (
                    <span className="text-[13px] text-gray-500">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {s.killSwitchActive ? (
                    <span className="text-[13px] text-red-600">ON</span>
                  ) : (
                    <span className="text-[13px] text-gray-500">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.avgCtr * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {version?.versionName ?? s.liveVersionId ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {s.latestDeploymentStatus ?? "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                  {new Date(s.lastCheckedAt).toLocaleString("ko-KR")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
