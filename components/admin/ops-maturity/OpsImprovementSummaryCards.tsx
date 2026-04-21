"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsImprovementSummary } from "@/lib/ops-maturity/mock-ops-improvement-summary";

export function OpsImprovementSummaryCards() {
  const summary = useMemo(() => getOpsImprovementSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">로드맵 항목</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          총 {summary.totalRoadmapItems} · 완료 {summary.completedCount}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          예정 {summary.plannedCount} · 진행 {summary.inProgressCount} · 차단 {summary.blockedCount}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">긴급 미해결 / 평균 성숙도</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.criticalOpenCount}건
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          평균 점수 {summary.averageOverallScore}
          {summary.latestScoreDate && ` (${summary.latestScoreDate})`}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">요약</p>
        <p className="sam-text-body text-sam-fg">
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
