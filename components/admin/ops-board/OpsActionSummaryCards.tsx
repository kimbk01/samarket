"use client";

import { useMemo, useState } from "react";
import { getOpsActionSummary } from "@/lib/ops-board/mock-ops-action-summary";

export function OpsActionSummaryCards() {
  const [checklistDate, setChecklistDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const summary = useMemo(
    () => getOpsActionSummary(checklistDate),
    [checklistDate]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">점검일</label>
        <input
          type="date"
          value={checklistDate}
          onChange={(e) => setChecklistDate(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">체크리스트 완료율</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.checklistCompletionRate.toFixed(0)}%
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            당일 항목 {summary.todayChecklistCount}건
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">미완료 액션아이템</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.totalOpenActions}
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            High/Critical {summary.highPriorityOpenActions}건
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">기한 초과</p>
          <p className={`sam-text-page-title font-semibold ${summary.overdueActions > 0 ? "text-red-600" : "text-sam-fg"}`}>
            {summary.overdueActions}
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            최근 회고 {summary.latestRetrospectiveAt ? new Date(summary.latestRetrospectiveAt).toLocaleDateString("ko-KR") : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
