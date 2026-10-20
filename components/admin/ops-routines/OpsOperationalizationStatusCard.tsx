"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsOperationalizationStatus } from "@/lib/ops-routines/ops-operationalization-status";
import { getOperationalizationLabel } from "@/lib/ops-routines/ops-routines-utils";
import Link from "next/link";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function OpsOperationalizationStatusCard() {
  const { t } = useI18n();
  const status = useMemo(() => getOpsOperationalizationStatus(), []);

  const statusClass =
    status.overallStatus === "optimized"
      ? "text-sam-success"
      : status.overallStatus === "needs_attention"
        ? "text-sam-danger"
        : status.overallStatus === "established"
          ? "text-sam-info"
          : "text-sam-warning";

  const statusBg =
    status.overallStatus === "optimized"
      ? "border-sam-success/40 bg-sam-success-soft/30"
      : status.overallStatus === "needs_attention"
        ? "border-sam-danger/40 bg-sam-danger-soft/50"
        : status.overallStatus === "established"
          ? "border-sam-info/40 bg-sam-info-soft/30"
          : "border-sam-warning/40 bg-sam-warning-soft/30";

  return (
    <div className="space-y-4">
      <div className={`rounded-ui-rect border p-4 ${statusBg}`}>
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_card_ops_status")}</p>
        <p className={`sam-text-hero font-semibold ${statusClass}`}>
          {getOperationalizationLabel(status.overallStatus)}
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          평가일: {formatAdminManilaDateTime(status.evaluatedAt)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_completion")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {status.routineCompletionRate}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_summary_overdue")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {status.overdueRoutineCount} / {status.carryOverCount}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_doc_action")}</p>
          <p className="sam-text-body text-sam-fg">
            {status.documentationFreshnessRate}% / {status.actionClosureRate}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sam-text-body-secondary text-sam-muted">
        <span>
          {t("admin_ops_tools_routines_monthly_review", {
            status: t(
              status.monthlyReviewDone
                ? "admin_ops_tools_routines_review_done"
                : "admin_ops_tools_routines_review_pending"
            ),
          })}
        </span>
        <span>
          {t("admin_ops_tools_routines_benchmark_review", {
            status: t(
              status.benchmarkReviewDone
                ? "admin_ops_tools_routines_review_done"
                : "admin_ops_tools_routines_review_pending"
            ),
          })}
        </span>
      </div>

      <p className="sam-text-body-secondary text-sam-muted">
        <Link href="/admin/ops-board" className="text-signature hover:underline">{t("admin_ops_tools_board_page_title")}</Link>
        {" · "}
        <Link href="/admin/ops-maturity" className="text-signature hover:underline">{t("admin_ops_tools_routines_link_maturity")}</Link>
        {" · "}
        <Link href="/admin/ops-benchmarks" className="text-signature hover:underline">{t("admin_ops_tools_routines_link_benchmark")}</Link>
        {" · "}
        <Link href="/admin/launch-week" className="text-signature hover:underline">{t("admin_ops_tools_routines_launch_week")}</Link>
      </p>

      {status.note && (
        <p className="sam-text-body-secondary text-sam-muted">{status.note}</p>
      )}
    </div>
  );
}
