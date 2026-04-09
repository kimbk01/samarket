"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsResponseQualityFeedback } from "@/lib/ops-learning/mock-ops-response-quality-feedback";

export function OpsResponseQualityTable() {
  const feedback = useMemo(() => getOpsResponseQualityFeedback(), []);

  if (feedback.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        대응 품질 피드백이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">이슈</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">런북 실행</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">품질</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">속도</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">문서적합도</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">요약</th>
          </tr>
        </thead>
        <tbody>
          {feedback.map((f) => (
            <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium text-gray-900">{f.incidentId}</td>
              <td className="px-3 py-2.5">
                {f.runbookExecutionId ? (
                  <Link
                    href={`/admin/ops-runbooks/${f.runbookExecutionId}`}
                    className="text-signature hover:underline"
                  >
                    {f.runbookExecutionId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(f.responseQualityScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(f.resolutionSpeedScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(f.documentFitScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-gray-600 text-[13px] max-w-[200px] truncate">
                {f.feedbackSummary}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
