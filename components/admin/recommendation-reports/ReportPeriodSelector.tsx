"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReportPeriod } from "@/lib/recommendation-reports/recommendation-report-utils";
import {
  generateRecommendationReport,
  getDateRange,
} from "@/lib/recommendation-reports/recommendation-report-utils";
import type { ReportType, ReportSurface } from "@/lib/types/recommendation-report";
import {
  recReportPeriodLabel,
  recReportTypeLabel,
  recSurfaceOptionLabel,
} from "@/components/admin/recommendation-admin-i18n";

const PERIODS: ReportPeriod[] = ["today", "yesterday", "last_7_days", "last_30_days"];
const REPORT_TYPES: ReportType[] = ["daily", "weekly", "custom"];
const SURFACES: ReportSurface[] = ["all", "home", "search", "shop"];

export function ReportPeriodSelector({
  onGenerated,
}: {
  onGenerated?: (reportId: string) => void;
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [surface, setSurface] = useState<ReportSurface>("all");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    const reportId = generateRecommendationReport(
      period,
      surface,
      reportType,
      "admin1"
    );
    setGenerating(false);
    onGenerated?.(reportId);
  };

  const range = getDateRange(period);

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="mb-3 sam-text-body font-medium text-sam-fg">
        {t("admin_rec_report_new_report")}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">
            {t("admin_rec_report_label_period")}
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {recReportPeriodLabel(t, p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">
            {t("admin_rec_th_surface")}
          </label>
          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value as ReportSurface)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {recSurfaceOptionLabel(t, s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">
            {t("admin_rec_report_label_type")}
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {recReportTypeLabel(t, rt)}
              </option>
            ))}
          </select>
        </div>
        <div className="sam-text-body-secondary text-sam-muted">
          {range.dateFrom} ~ {range.dateTo}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {generating ? t("admin_rec_report_generating") : t("admin_rec_report_generate")}
        </button>
      </div>
      <p className="mt-2 sam-text-helper text-sam-muted">
        {t("admin_rec_report_custom_hint")}
      </p>
    </div>
  );
}
