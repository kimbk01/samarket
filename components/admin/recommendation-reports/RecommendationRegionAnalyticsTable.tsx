"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationRegionAnalytics } from "@/lib/recommendation-analytics/recommendation-analytics-state";

interface RecommendationRegionAnalyticsTableProps {
  reportId: string;
}

export function RecommendationRegionAnalyticsTable({
  reportId,
}: RecommendationRegionAnalyticsTableProps) {
  const { t } = useI18n();
  const rows = useMemo(
    () => getRecommendationRegionAnalytics(reportId),
    [reportId]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_rec_report_empty_region")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_region")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_impressions")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_clicks")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_ctr")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_conversion_rate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {r.region} {r.city}
                {r.barangay ? ` · ${r.barangay}` : ""}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.impressionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.clickCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(r.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(r.conversionRate * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
