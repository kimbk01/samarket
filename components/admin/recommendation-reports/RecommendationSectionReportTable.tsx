"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationReportSections } from "@/lib/recommendation-reports/mock-recommendation-report-sections";
import type { SectionHealthStatus } from "@/lib/types/recommendation-report";
import {
  recHealthLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";

interface RecommendationSectionReportTableProps {
  reportId: string;
}

export function RecommendationSectionReportTable({
  reportId,
}: RecommendationSectionReportTableProps) {
  const { t } = useI18n();
  const sections = useMemo(
    () => getRecommendationReportSections(reportId),
    [reportId]
  );

  if (sections.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_rec_report_empty_section")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_section")}
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
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr
              key={s.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {recSurfaceLabel(t, s.surface)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{s.sectionKey}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {s.impressionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {s.clickCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(s.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {s.conversionCount}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    s.status === "healthy"
                      ? "bg-emerald-50 text-emerald-800"
                      : s.status === "warning"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  {recHealthLabel(t, s.status as SectionHealthStatus)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
