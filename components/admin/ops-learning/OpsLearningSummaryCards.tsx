"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsLearningSummary } from "@/lib/ops-learning/mock-ops-learning-summary";

export function OpsLearningSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getOpsLearningSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_learning_summary_patterns")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalPatterns} / {summary.openPatterns} / {summary.mitigatedPatterns}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_learning_summary_quality")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {(summary.avgResponseQualityScore * 100).toFixed(0)}% / {(summary.avgResolutionSpeedScore * 100).toFixed(0)}%
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_learning_summary_recur")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.highRecurrencePatterns}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {summary.latestDetectedAt
            ? new Date(summary.latestDetectedAt).toLocaleString("ko-KR")
            : "-"}
        </p>
      </div>
    </div>
  );
}
