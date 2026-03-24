"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getRecommendationSectionHealth } from "@/lib/recommendation-monitoring/mock-recommendation-section-health";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { HealthStatus } from "@/lib/types/recommendation-monitoring";

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "정상",
  warning: "경고",
  critical: "위험",
};

export function SectionHealthTable() {
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");
  const sections = useMemo(
    () =>
      getRecommendationSectionHealth(
        surfaceFilter || undefined
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
      {sections.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          섹션 헬스 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  섹션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  상태
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
                  빈비율
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  갱신
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
                    {s.impressionCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {s.clickCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {(s.ctr * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {(s.emptyRate * 100).toFixed(2)}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                    {new Date(s.updatedAt).toLocaleString("ko-KR")}
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
