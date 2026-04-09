"use client";

import { useMemo } from "react";
import { getOpsDocumentSummary } from "@/lib/ops-docs/mock-ops-document-summary";

export function OpsDocumentSummaryCards() {
  const summary = useMemo(() => getOpsDocumentSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">전체 문서</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalDocuments}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">활성 / 초안 / 보관</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalActive} / {summary.totalDraft} / {summary.totalArchived}
        </p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">고정 문서</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalPinned}
        </p>
        <p className="text-[13px] text-gray-600">
          최근 수정 {summary.latestUpdatedAt ? new Date(summary.latestUpdatedAt).toLocaleString("ko-KR") : "-"}
        </p>
      </div>
    </div>
  );
}
