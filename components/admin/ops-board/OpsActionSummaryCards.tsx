"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsActionSummary } from "@/lib/ops-board/mock-ops-action-summary";

export function OpsActionSummaryCards() {
  const { t } = useI18n();
  const [checklistDate, setChecklistDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const summary = useMemo(
    () => getOpsActionSummary(checklistDate),
    [checklistDate]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_board_check_date")}</label>
        <input
          type="date"
          value={checklistDate}
          onChange={(e) => setChecklistDate(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_board_checklist_rate")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.checklistCompletionRate.toFixed(0)}%
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_ops_tools_board_today_items", { count: summary.todayChecklistCount })}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_board_open_actions")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.totalOpenActions}
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_ops_tools_board_high_priority", { count: summary.highPriorityOpenActions })}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_board_overdue")}</p>
          <p className={`sam-text-page-title font-semibold ${summary.overdueActions > 0 ? "text-red-600" : "text-sam-fg"}`}>
            {summary.overdueActions}
          </p>
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_ops_tools_board_latest_retro")}{" "}
            {summary.latestRetrospectiveAt
              ? new Date(summary.latestRetrospectiveAt).toLocaleDateString()
              : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
