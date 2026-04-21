"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsResolutionCases } from "@/lib/ops-knowledge-graph/mock-ops-resolution-cases";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

const OUTCOME_LABELS: Record<string, string> = {
  resolved: "해결",
  mitigated: "완화",
  rolled_back: "롤백",
  fallback_applied: "Fallback 적용",
  escalated: "에스컬레이션",
};

export function OpsResolutionCaseTable() {
  const cases = useMemo(() => getOpsResolutionCases(), []);

  if (cases.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        해결 사례가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">이슈/연결</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">주요 문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">런북 실행</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">결과</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">메모</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const doc = getOpsDocumentById(c.primaryDocumentId);
            return (
              <tr key={c.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 text-sam-fg">{c.incidentId}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/ops-docs/${c.primaryDocumentId}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {doc?.title ?? c.primaryDocumentId}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {c.relatedRunbookExecutionId ? (
                    <Link
                      href={`/admin/ops-runbooks/${c.relatedRunbookExecutionId}`}
                      className="text-signature hover:underline"
                    >
                      {c.relatedRunbookExecutionId}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {OUTCOME_LABELS[c.outcomeType]}
                </td>
                <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary max-w-[200px] truncate">
                  {c.note || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
