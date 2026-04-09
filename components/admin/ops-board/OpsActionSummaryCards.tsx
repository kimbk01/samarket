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
        <label className="text-[14px] font-medium text-gray-700">점검일</label>
        <input
          type="date"
          value={checklistDate}
          onChange={(e) => setChecklistDate(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">체크리스트 완료율</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.checklistCompletionRate.toFixed(0)}%
          </p>
          <p className="text-[13px] text-gray-600">
            당일 항목 {summary.todayChecklistCount}건
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">미완료 액션아이템</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.totalOpenActions}
          </p>
          <p className="text-[13px] text-gray-600">
            High/Critical {summary.highPriorityOpenActions}건
          </p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">기한 초과</p>
          <p className={`text-[20px] font-semibold ${summary.overdueActions > 0 ? "text-red-600" : "text-gray-900"}`}>
            {summary.overdueActions}
          </p>
          <p className="text-[13px] text-gray-600">
            최근 회고 {summary.latestRetrospectiveAt ? new Date(summary.latestRetrospectiveAt).toLocaleDateString("ko-KR") : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
