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
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        해결 사례가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">이슈/연결</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">주요 문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">런북 실행</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">결과</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">메모</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const doc = getOpsDocumentById(c.primaryDocumentId);
            return (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 text-gray-700">{c.incidentId}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/ops-docs/${c.primaryDocumentId}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {doc?.title ?? c.primaryDocumentId}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-gray-600">
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
                <td className="px-3 py-2.5 text-gray-700">
                  {OUTCOME_LABELS[c.outcomeType]}
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-[13px] max-w-[200px] truncate">
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
