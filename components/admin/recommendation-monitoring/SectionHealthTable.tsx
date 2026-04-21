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
        <label className="sam-text-body font-medium text-sam-fg">surface</label>
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === ""
                ? ""
                : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">전체</option>
          <option value="home">홈</option>
          <option value="search">검색</option>
          <option value="shop">상점</option>
        </select>
      </div>
      {sections.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          섹션 헬스 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  섹션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  상태
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  노출
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  클릭
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  CTR
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  빈비율
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  갱신
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {SURFACE_LABELS[s.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{s.sectionKey}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
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
                  <td className="px-3 py-2.5 text-sam-fg">
                    {s.impressionCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {s.clickCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {(s.ctr * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {(s.emptyRate * 100).toFixed(2)}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
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
