"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsImprovementSummary } from "@/lib/ops-maturity/mock-ops-improvement-summary";

export function OpsImprovementSummaryCards() {
  const summary = useMemo(() => getOpsImprovementSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">로드맵 항목</p>
        <p className="text-[20px] font-semibold text-gray-900">
          총 {summary.totalRoadmapItems} · 완료 {summary.completedCount}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          예정 {summary.plannedCount} · 진행 {summary.inProgressCount} · 차단 {summary.blockedCount}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">긴급 미해결 / 평균 성숙도</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.criticalOpenCount}건
        </p>
        <p className="mt-1 text-[13px] text-gray-600">
          평균 점수 {summary.averageOverallScore}
          {summary.latestScoreDate && ` (${summary.latestScoreDate})`}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">요약</p>
        <p className="text-[14px] text-gray-700">
          <Link href="/admin/ops-maturity" className="text-signature hover:underline">
            성숙도 점수
          </Link>
          {" · "}
          <Link href="/admin/ops-learning" className="text-signature hover:underline">
            운영 학습
          </Link>
          {" · "}
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            액션아이템
          </Link>
        </p>
      </div>
    </div>
  );
}
