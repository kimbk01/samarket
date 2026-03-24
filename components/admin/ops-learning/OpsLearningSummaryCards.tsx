"use client";

import { useMemo } from "react";
import { getOpsLearningSummary } from "@/lib/ops-learning/mock-ops-learning-summary";

export function OpsLearningSummaryCards() {
  const summary = useMemo(() => getOpsLearningSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">패턴 / 미해결 / 완화</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalPatterns} / {summary.openPatterns} / {summary.mitigatedPatterns}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">평균 대응 품질 / 해결 속도</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {(summary.avgResponseQualityScore * 100).toFixed(0)}% / {(summary.avgResolutionSpeedScore * 100).toFixed(0)}%
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">고재발 패턴 / 최근 탐지</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.highRecurrencePatterns}
        </p>
        <p className="text-[13px] text-gray-600">
          {summary.latestDetectedAt
            ? new Date(summary.latestDetectedAt).toLocaleString("ko-KR")
            : "-"}
        </p>
      </div>
    </div>
  );
}
