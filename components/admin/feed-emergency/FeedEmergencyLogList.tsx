"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedEmergencyLogs } from "@/lib/feed-emergency/mock-feed-emergency-logs";
import { getFeedEmergencyActionLabel } from "@/lib/feed-emergency/mock-feed-emergency-logs";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { SECTION_OVERRIDE_LABELS } from "@/lib/feed-emergency/mock-feed-section-overrides";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";

export function FeedEmergencyLogList() {
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");

  const logs = useMemo(
    () =>
      getFeedEmergencyLogs(
        surfaceFilter || undefined,
        80
      ),
    [surfaceFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">surface</label>
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === ""
                ? ""
                : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체</option>
          <option value="home">홈</option>
          <option value="search">검색</option>
          <option value="shop">상점</option>
        </select>
      </div>
      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          긴급 조치 로그가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  액션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  섹션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  담당
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                    {new Date(l.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {SURFACE_LABELS[l.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {getFeedEmergencyActionLabel(l.actionType)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {l.sectionKey
                      ? SECTION_OVERRIDE_LABELS[l.sectionKey as FeedSectionOverrideKey]
                      : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {l.actorNickname} ({l.actorType})
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                    {l.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
