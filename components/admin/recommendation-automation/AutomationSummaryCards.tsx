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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">정책</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.activePolicies} / {summary.totalPolicies}
        </p>
        <p className="text-[13px] text-sam-muted">활성 / 전체</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">Dry-run</p>
        <p className="text-[20px] font-semibold text-amber-600">
          {summary.dryRunPolicies}
        </p>
        <p className="text-[13px] text-sam-muted">정책</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">오늘 실행</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.executionsToday}
        </p>
        <p className="text-[13px] text-sam-muted">
          성공 {summary.successCount} / 실패 {summary.failedCount} / 스킵 {summary.skippedCount}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">Fallback / 킬스위치</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.activeFallbackCount} / {summary.activeKillSwitchCount}
        </p>
        <p className="text-[13px] text-sam-muted">surface</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">최근 실행</p>
        <p className="text-[14px] font-medium text-sam-fg">
          {summary.latestExecutionAt
            ? new Date(summary.latestExecutionAt).toLocaleString("ko-KR", { hour12: false })
            : "-"}
        </p>
      </div>
    </div>
  );
}
