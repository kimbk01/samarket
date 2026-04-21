"use client";

import { useMemo } from "react";
import { getOpsRoutineSummary } from "@/lib/ops-routines/mock-ops-routine-summary";
import Link from "next/link";

export function OpsRoutineSummaryCards() {
  const summary = useMemo(() => getOpsRoutineSummary(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">전체 루틴</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.completedRoutines} / {summary.totalRoutines} 완료
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">지연 / 이월</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.overdueRoutines} / {summary.carryOverRoutines}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">주간 / 월간 / 분기 완료율</p>
          <p className="sam-text-body text-sam-fg">
            {summary.weeklyCompletionRate}% / {summary.monthlyCompletionRate}% /{" "}
            {summary.quarterlyCompletionRate}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">연결</p>
          <p className="sam-text-body-secondary text-sam-fg">
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              운영 보드
            </Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">
              보고서
            </Link>
            {" · "}
            <Link href="/admin/ops-maturity" className="text-signature hover:underline">
              성숙도
            </Link>
            {" · "}
            <Link href="/admin/ops-benchmarks" className="text-signature hover:underline">
              벤치마크
            </Link>
          </p>
        </div>
      </div>

      {summary.latestUpdatedAt && (
        <p className="sam-text-helper text-sam-muted">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
