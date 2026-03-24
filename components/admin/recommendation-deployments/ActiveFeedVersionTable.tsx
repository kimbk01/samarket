"use client";

import { useMemo, useState } from "react";
import { getActiveFeedVersions } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { rollbackSurface } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

export function ActiveFeedVersionTable() {
  const [refresh, setRefresh] = useState(0);
  const active = useMemo(() => getActiveFeedVersions(), [refresh]);

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        운영 버전이 없습니다.
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
              현재 live 버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              이전 버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              롤아웃 %
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              갱신
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              롤백
            </th>
          </tr>
        </thead>
        <tbody>
          {active.map((a) => {
            const version = getFeedVersionById(a.liveVersionId);
            const prevVersion = a.previousVersionId
              ? getFeedVersionById(a.previousVersionId)
              : null;
            const canRollback = !!a.previousVersionId;
            return (
              <tr
                key={a.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {SURFACE_LABELS[a.surface]}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {version?.versionName ?? a.liveVersionId}
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {prevVersion?.versionName ?? a.previousVersionId ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-gray-700">{a.rolloutPercent}%</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                  {new Date(a.updatedAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2.5">
                  {canRollback ? (
                    <button
                      type="button"
                      onClick={() => {
                        rollbackSurface(a.surface as RecommendationSurface);
                        setRefresh((r) => r + 1);
                      }}
                      className="text-[13px] text-amber-600 hover:underline"
                    >
                      이전 버전으로 롤백
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
