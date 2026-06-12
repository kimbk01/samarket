"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationAutomationSummary } from "@/lib/recommendation-automation/recommendation-automation-summary";

export function AutomationSummaryCards() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const summary = useMemo(
    () => getRecommendationAutomationSummary(),
    [refresh]
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_auto_summary_policy")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.activePolicies} / {summary.totalPolicies}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_rec_auto_summary_active_total")}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_th_dry_run")}</p>
        <p className="sam-text-page-title font-semibold text-amber-600">
          {summary.dryRunPolicies}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_rec_auto_summary_policy")}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_auto_summary_today_runs")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.executionsToday}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_rec_auto_summary_run_counts", {
            success: summary.successCount,
            failed: summary.failedCount,
            skipped: summary.skippedCount,
          })}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_auto_summary_fallback_kill")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.activeFallbackCount} / {summary.activeKillSwitchCount}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_rec_th_surface")}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_auto_summary_last_run")}</p>
        <p className="sam-text-body font-medium text-sam-fg">
          {summary.latestExecutionAt
            ? new Date(summary.latestExecutionAt).toLocaleString(undefined, { hour12: false })
            : "-"}
        </p>
      </div>
    </div>
  );
}
