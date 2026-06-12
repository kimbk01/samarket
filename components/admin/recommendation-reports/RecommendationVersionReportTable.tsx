"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationReportVersions } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

interface RecommendationVersionReportTableProps {
  reportId: string;
}

export function RecommendationVersionReportTable({
  reportId,
}: RecommendationVersionReportTableProps) {
  const { t } = useI18n();
  const versions = useMemo(
    () => getRecommendationReportVersions(reportId),
    [reportId]
  );

  if (versions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_rec_report_empty_version")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_version")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_impressions_clicks")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_ctr_conversion")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_deploy_live")}
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const version = getFeedVersionById(v.versionId);
            return (
              <tr
                key={v.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {recSurfaceLabel(t, v.surface)}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {version?.versionName ?? v.versionId}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {v.impressionCount.toLocaleString()} / {v.clickCount.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {(v.ctr * 100).toFixed(2)}% / {(v.conversionRate * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {v.deploymentStatus}
                  {v.isLiveVersion ? ` ${t("admin_rec_report_live_suffix")}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
