"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getOpsAdminPerformanceReviews } from "@/lib/ops-benchmarks/ops-benchmarks-state";
import { AdminTable } from "@/components/admin/AdminTable";
import type { OpsPerformanceReviewStatus } from "@/lib/types/ops-benchmarks";

const STATUS_LABELS: Record<OpsPerformanceReviewStatus, MessageKey> = {
  draft: "admin_ops_bench_review_status_draft",
  published: "admin_ops_bench_review_status_published",
  archived: "admin_ops_bench_review_status_archived",
};

export function OpsAdminPerformanceReviewTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
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
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_benchmark_k59815a4a")}</span>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        />
        {teamFilter !== null && (
          <span className="sam-text-body-secondary text-sam-muted">
            {t("admin_ops_bench_team_filter_placeholder")}
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_bench_no_reviews")} />
      ) : (
        <AdminTable
          headers={[
            t("admin_ops_bench_review_th_admin"),
            t("admin_ops_bench_review_th_incident"),
            t("admin_ops_bench_review_th_checklist_rate"),
            t("admin_ops_bench_review_th_action_rate"),
            t("admin_ops_bench_review_th_docs"),
            t("admin_ops_bench_review_th_runbook"),
            t("admin_ops_bench_review_th_learning"),
            t("admin_ops_bench_review_th_overall"),
            t("admin_ops_bench_review_th_status"),
            t("admin_ops_bench_review_th_note"),
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
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-helper text-sam-muted">
                  {t(STATUS_LABELS[r.status])}
                </span>
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {r.reviewNote || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      <p className="sam-text-helper text-sam-muted">
        {t("admin_ops_benchmarks_review_memo_hint")}
      </p>
    </div>
  );
}
