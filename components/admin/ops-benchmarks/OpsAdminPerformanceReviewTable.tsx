"use client";

import { useMemo, useState } from "react";
import { getOpsAdminPerformanceReviews } from "@/lib/ops-benchmarks/mock-ops-admin-performance-reviews";
import { AdminTable } from "@/components/admin/AdminTable";
import type { OpsPerformanceReviewStatus } from "@/lib/types/ops-benchmarks";

const STATUS_LABELS: Record<OpsPerformanceReviewStatus, string> = {
  draft: "초안",
  published: "공개",
  archived: "보관",
};

export function OpsAdminPerformanceReviewTable() {
  const [period, setPeriod] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [teamFilter] = useState<string | null>(null);

  const reviews = useMemo(
    () =>
      getOpsAdminPerformanceReviews({
        reviewPeriod: period,
        status: "published",
      }),
    [period]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">리뷰 기간</span>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        />
        {teamFilter !== null && (
          <span className="text-[13px] text-sam-muted">
            팀 필터 placeholder
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 기간 성과 리뷰가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "관리자",
            "incident 기여",
            "체크리스트 완료율",
            "액션 완료율",
            "문서 기여",
            "런북 기여",
            "학습 기여",
            "종합",
            "상태",
            "메모",
          ]}
        >
          {reviews.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.adminNickname}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.incidentContributionScore}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.checklistCompletionRate}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.actionCompletionRate}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.documentContributionScore}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.runbookContributionScore}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.learningContributionScore}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.overallPerformanceScore}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 text-[12px] text-sam-muted">
                  {STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-sam-muted">
                {r.reviewNote || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      <p className="text-[12px] text-sam-muted">
        성과 리뷰 메모/코멘트는 위 표의 메모 칸에 표시됩니다. (편집 placeholder)
      </p>
    </div>
  );
}
