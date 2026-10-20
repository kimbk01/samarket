"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReportType } from "@/lib/types/recommendation-report";
import { getRecommendationReports } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import {
  recReportTypeLabel,
  recSurfaceOptionLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const REPORT_TYPES: ReportType[] = ["daily", "weekly", "custom"];

interface RecommendationReportTableProps {
  refresh?: number;
}

export function RecommendationReportTable({ refresh = 0 }: RecommendationReportTableProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 유형 필터 — 주소 `?status=daily|weekly|custom` 보존 (R7) */
  const lq = useAdminListQuery({ statuses: REPORT_TYPES });
  const typeFilter = lq.query.status as ReportType | "";
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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        status={{
          value: typeFilter,
          onChange: lq.setStatus,
          label: t("admin_rec_th_report_type"),
          options: [
            { value: "", label: t("admin_rec_report_filter_all_types") },
            ...REPORT_TYPES.map((rt) => ({ value: rt, label: recReportTypeLabel(t, rt) })),
          ],
        }}
      />
      {reports.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={typeFilter ? undefined : t("admin_rec_report_empty_list")}
          onReset={typeFilter ? lq.reset : undefined}
        />
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
                    {formatAdminManilaDateTime(r.generatedAt)}
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
