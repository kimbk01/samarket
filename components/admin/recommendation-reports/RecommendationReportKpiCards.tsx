"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationReportKpis } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

interface RecommendationReportKpiCardsProps {
  reportId: string;
}

export function RecommendationReportKpiCards({ reportId }: RecommendationReportKpiCardsProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const kpis = useMemo(
    () => getRecommendationReportKpis(reportId),
    [reportId]
  );

  if (!kpis) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_rec_report_empty_kpi")} />
    );
  }

  const items: { labelKey: MessageKey; value: string | number }[] = [
    { labelKey: "admin_rec_report_kpi_impressions", value: formatAdminNumber(kpis.impressionCount) },
    { labelKey: "admin_rec_report_kpi_clicks", value: formatAdminNumber(kpis.clickCount) },
    { labelKey: "admin_rec_th_ctr", value: `${(kpis.ctr * 100).toFixed(2)}%` },
    { labelKey: "admin_rec_report_kpi_conversions", value: formatAdminNumber(kpis.conversionCount) },
    {
      labelKey: "admin_rec_report_kpi_conversion_rate",
      value: `${(kpis.conversionRate * 100).toFixed(2)}%`,
    },
    { labelKey: "admin_rec_report_kpi_avg_score", value: kpis.avgScore.toFixed(2) },
    { labelKey: "admin_rec_report_kpi_fallback", value: kpis.fallbackCount },
    { labelKey: "admin_rec_report_kpi_kill_switch", value: kpis.killSwitchCount },
    { labelKey: "admin_rec_report_kpi_rollback", value: kpis.rollbackCount },
    { labelKey: "admin_rec_report_kpi_incidents", value: kpis.incidentCount },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.labelKey}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="sam-text-helper text-sam-muted">{t(item.labelKey)}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
