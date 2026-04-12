"use client";

import { useMemo } from "react";
import { getOpsLearningSummary } from "@/lib/ops-learning/mock-ops-learning-summary";

export function OpsLearningSummaryCards() {
  const summary = useMemo(() => getOpsLearningSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">패턴 / 미해결 / 완화</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.totalPatterns} / {summary.openPatterns} / {summary.mitigatedPatterns}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">평균 대응 품질 / 해결 속도</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {(summary.avgResponseQualityScore * 100).toFixed(0)}% / {(summary.avgResolutionSpeedScore * 100).toFixed(0)}%
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">고재발 패턴 / 최근 탐지</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.highRecurrencePatterns}
        </p>
        <p className="text-[13px] text-sam-muted">
          {summary.latestDetectedAt
            ? new Date(summary.latestDetectedAt).toLocaleString("ko-KR")
            : "-"}
        </p>
      </div>
    </div>
  );
}
