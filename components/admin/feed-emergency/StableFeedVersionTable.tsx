"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getStableFeedVersions } from "@/lib/feed-emergency/mock-stable-feed-versions";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

export function StableFeedVersionTable() {
  const [refresh, setRefresh] = useState(0);

  const stable = useMemo(() => getStableFeedVersions(), [refresh]);

  if (stable.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        안정 버전 후보가 없습니다. Fallback 우선순위 설정 시 여기서 참조됩니다.
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
              안정도
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              평균 CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              평균 전환율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              등록
            </th>
          </tr>
        </thead>
        <tbody>
          {stable.map((s) => {
            const version = getFeedVersionById(s.versionId);
            return (
              <tr
                key={s.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {SURFACE_LABELS[s.surface]}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {version?.versionName ?? s.versionId}
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.stabilityScore * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.avgCtr * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {(s.avgConversionRate * 100).toFixed(2)}%
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                  {new Date(s.markedAt).toLocaleString("ko-KR")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
