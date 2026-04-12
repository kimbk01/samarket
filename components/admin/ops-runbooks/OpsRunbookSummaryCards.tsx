"use client";

import { useMemo } from "react";
import { getOpsRunbookSummary } from "@/lib/ops-runbooks/mock-ops-runbook-summary";

export function OpsRunbookSummaryCards() {
  const summary = useMemo(() => getOpsRunbookSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">총 실행</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.totalExecutions}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">진행 중 / 완료 / 대기</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.inProgressExecutions} / {summary.completedExecutions} / {summary.blockedExecutions}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">평균 소요</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.avgCompletionMinutes != null ? `${summary.avgCompletionMinutes}분` : "-"}
        </p>
        <p className="text-[13px] text-sam-muted">
          최근 실행 {summary.latestExecutionAt ? new Date(summary.latestExecutionAt).toLocaleString("ko-KR") : "-"}
        </p>
      </div>
    </div>
  );
}
