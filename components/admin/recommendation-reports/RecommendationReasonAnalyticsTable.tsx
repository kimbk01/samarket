"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationReasonAnalytics } from "@/lib/recommendation-analytics/recommendation-analytics-state";

interface RecommendationReasonAnalyticsTableProps {
  reportId: string;
  limit?: number;
}

export function RecommendationReasonAnalyticsTable({
  reportId,
  limit = 15,
}: RecommendationReasonAnalyticsTableProps) {
  const { t } = useI18n();
  const rows = useMemo(
    () => getRecommendationReasonAnalytics(reportId, limit),
    [reportId, limit]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_rec_report_empty_reason")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_rank")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_report_th_reason")}
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
              {t("admin_rec_th_conversion")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{r.rank}</td>
              <td className="px-3 py-2.5 text-sam-fg">{r.reasonLabel}</td>
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
                {r.conversionCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
