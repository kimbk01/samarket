"use client";

import { useMemo } from "react";
import { getOpsChecklistTemplates } from "@/lib/ops-board/mock-ops-checklist-templates";
import type { OpsChecklistCategory } from "@/lib/types/ops-board";

const CATEGORY_LABELS: Record<OpsChecklistCategory, string> = {
  monitoring: "모니터링",
  feed: "피드",
  ads: "광고",
  moderation: "검수",
  reports: "보고서",
  automation: "자동화",
};

const SURFACE_LABELS: Record<string, string> = {
  all: "전체",
  home: "홈",
  search: "검색",
  shop: "상점",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

export function OpsChecklistTemplateTable() {
  const templates = useMemo(() => getOpsChecklistTemplates(), []);

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        체크리스트 템플릿이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              순서
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              제목
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              카테고리
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface / 우선순위
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr
              key={t.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">{t.sortOrder}</td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {t.title}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {CATEGORY_LABELS[t.category]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[t.defaultSurface]} / {PRIORITY_LABELS[t.defaultPriority]}
              </td>
              <td className="px-3 py-2.5">
                {t.isActive ? (
                  <span className="text-[13px] text-emerald-600">ON</span>
                ) : (
                  <span className="text-[13px] text-gray-400">OFF</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
