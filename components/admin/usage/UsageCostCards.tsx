"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getLatestUsageMetric } from "@/lib/usage/usage-state";

export function UsageCostCards() {
  const { t } = useI18n();
  const latest = useMemo(() => getLatestUsageMetric(), []);

  const surge = latest && (latest.apiRequests > 500000 || latest.estimatedCost > 90);

  return (
    <div className="space-y-4">
      {surge && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-3 sam-text-body-secondary font-medium text-amber-800">
          {t("admin_usage_surge_warning")}
        </div>
      )}
      {latest ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">{t("admin_usage_db")}</p>
            <p className="sam-text-page-title font-semibold text-sam-fg">{latest.dbUsage} GB</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">Storage</p>
            <p className="sam-text-page-title font-semibold text-sam-fg">{latest.storageUsage} GB</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">Bandwidth</p>
            <p className="sam-text-page-title font-semibold text-sam-fg">{latest.bandwidth} GB</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">{t("admin_usage_api_requests")}</p>
            <p className="sam-text-page-title font-semibold text-sam-fg">{(latest.apiRequests / 1000).toFixed(0)}K</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">{t("admin_usage_monthly_cost")}</p>
            <p className="sam-text-page-title font-semibold text-sam-fg">${latest.estimatedCost}</p>
          </div>
        </div>
      ) : (
        <p className="sam-text-body text-sam-muted">{t("admin_usage_no_data")}</p>
      )}
      <p className="sam-text-helper text-sam-muted">{t("admin_usage_graph_placeholder")}</p>
    </div>
  );
}
