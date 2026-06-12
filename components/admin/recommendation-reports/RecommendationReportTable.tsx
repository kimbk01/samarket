"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReportType } from "@/lib/types/recommendation-report";
import { getRecommendationReports } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import {
  recReportTypeLabel,
  recSurfaceOptionLabel,
} from "@/components/admin/recommendation-admin-i18n";

const REPORT_TYPES: ReportType[] = ["daily", "weekly", "custom"];

interface RecommendationReportTableProps {
  refresh?: number;
}

export function RecommendationReportTable({ refresh = 0 }: RecommendationReportTableProps) {
  const { t } = useI18n();
  const [typeFilter, setTypeFilter] = useState<ReportType | "">("");
  const reports = useMemo(
    () =>
      getRecommendationReports({
        reportType: typeFilter || undefined,
        limit: 30,
      }),
    [refresh, typeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value === "" ? "" : (e.target.value as ReportType))
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_report_filter_all_types")}</option>
          {REPORT_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {recReportTypeLabel(t, rt)}
            </option>
          ))}
        </select>
      </div>
      {reports.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_report_empty_list")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_title")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_report_type")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_surface")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_period")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_generated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/recommendation-reports/${r.id}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recReportTypeLabel(t, r.reportType)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recSurfaceOptionLabel(t, r.surface)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {r.dateFrom} ~ {r.dateTo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(r.generatedAt).toLocaleString(undefined, { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
