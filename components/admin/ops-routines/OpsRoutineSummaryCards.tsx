"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsRoutineSummary } from "@/lib/ops-routines/ops-routines-summary";
import Link from "next/link";

export function OpsRoutineSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getOpsRoutineSummary(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_summary_total")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.completedRoutines} / {summary.totalRoutines} 완료
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_summary_overdue")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.overdueRoutines} / {summary.carryOverRoutines}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_summary_rates")}</p>
          <p className="sam-text-body text-sam-fg">
            {summary.weeklyCompletionRate}% / {summary.monthlyCompletionRate}% /{" "}
            {summary.quarterlyCompletionRate}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_th_link")}</p>
          <p className="sam-text-body-secondary text-sam-fg">
            <Link href="/admin/ops-board" className="text-signature hover:underline">{t("admin_ops_tools_board_page_title")}</Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">{t("admin_ops_tools_action_src_report")}</Link>
            {" · "}
            <Link href="/admin/ops-maturity" className="text-signature hover:underline">{t("admin_ops_tools_routines_link_maturity")}</Link>
            {" · "}
            <Link href="/admin/ops-benchmarks" className="text-signature hover:underline">{t("admin_ops_tools_routines_link_benchmark")}</Link>
          </p>
        </div>
      </div>

      {summary.latestUpdatedAt && (
        <p className="sam-text-helper text-sam-muted">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
