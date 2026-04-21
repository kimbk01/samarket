"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsResponseQualityFeedback } from "@/lib/ops-learning/mock-ops-response-quality-feedback";

export function OpsResponseQualityTable() {
  const feedback = useMemo(() => getOpsResponseQualityFeedback(), []);

  if (feedback.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        대응 품질 피드백이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">이슈</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">런북 실행</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">품질</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">속도</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">문서적합도</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">요약</th>
          </tr>
        </thead>
        <tbody>
          {feedback.map((f) => (
            <tr key={f.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{f.incidentId}</td>
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
              <td className="px-3 py-2.5 text-sam-fg">
                {(f.responseQualityScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(f.resolutionSpeedScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(f.documentFitScore * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary max-w-[200px] truncate">
                {f.feedbackSummary}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
