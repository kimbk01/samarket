"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsRunbookSummary } from "@/lib/ops-runbooks/mock-ops-runbook-summary";

export function OpsRunbookSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getOpsRunbookSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_runbook_summary_total")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalExecutions}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_runbook_summary_progress")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.inProgressExecutions} / {summary.completedExecutions} / {summary.blockedExecutions}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_runbook_summary_avg")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.avgCompletionMinutes != null ? `${summary.avgCompletionMinutes}분` : "-"}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          최근 실행 {summary.latestExecutionAt ? new Date(summary.latestExecutionAt).toLocaleString("ko-KR") : "-"}
        </p>
      </div>
    </div>
  );
}
