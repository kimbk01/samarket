"use client";

import { useMemo, useState } from "react";
import { getRecommendationAutomationSummary } from "@/lib/recommendation-automation/mock-recommendation-automation-summary";

export function AutomationSummaryCards() {
  const [refresh, setRefresh] = useState(0);
  const summary = useMemo(
    () => getRecommendationAutomationSummary(),
    [refresh]
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">정책</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.activePolicies} / {summary.totalPolicies}
        </p>
        <p className="text-[13px] text-gray-600">활성 / 전체</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">Dry-run</p>
        <p className="text-[20px] font-semibold text-amber-600">
          {summary.dryRunPolicies}
        </p>
        <p className="text-[13px] text-gray-600">정책</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">오늘 실행</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.executionsToday}
        </p>
        <p className="text-[13px] text-gray-600">
          성공 {summary.successCount} / 실패 {summary.failedCount} / 스킵 {summary.skippedCount}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">Fallback / 킬스위치</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.activeFallbackCount} / {summary.activeKillSwitchCount}
        </p>
        <p className="text-[13px] text-gray-600">surface</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">최근 실행</p>
        <p className="text-[14px] font-medium text-gray-900">
          {summary.latestExecutionAt
            ? new Date(summary.latestExecutionAt).toLocaleString("ko-KR", { hour12: false })
            : "-"}
        </p>
      </div>
    </div>
  );
}
