"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationMonitoringSummary } from "@/lib/recommendation-analytics/recommendation-monitoring-summary";

export function HealthSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getRecommendationMonitoringSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_mon_summary_healthy")}</p>
        <p className="sam-text-page-title font-semibold text-emerald-600">
          {summary.totalHealthy}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_rec_th_surface")}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_mon_summary_warning")}</p>
        <p className="sam-text-page-title font-semibold text-amber-600">
          {summary.totalWarning}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_rec_th_surface")}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_mon_summary_critical")}</p>
        <p className="sam-text-page-title font-semibold text-red-600">
          {summary.totalCritical}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_rec_th_surface")}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_rec_mon_summary_open_issues")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.openIncidentCount} / {summary.activeAlertCount}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_rec_mon_summary_fallback_kill", {
            fallback: summary.fallbackSurfaceCount,
            kill: summary.killSwitchSurfaceCount,
          })}
        </p>
      </div>
    </div>
  );
}
