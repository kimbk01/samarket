"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";

const SURFACE_LABEL_KEYS: Record<string, MessageKey> = {
  home: "admin_rec_surface_home",
  search: "admin_rec_surface_search_screen",
  shop: "admin_rec_surface_shop",
};

interface RecommendationPerformanceTableProps {
  summaries: RecommendationAnalyticsSummary[];
}

export function RecommendationPerformanceTable({
  summaries,
}: RecommendationPerformanceTableProps) {
  const { t } = useI18n();
  if (summaries.length === 0) {
    return (
      <AdminEmptyState ko message={t("admin_rec_no_performance")} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_impressions")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_clicks")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_conversions")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              CTR
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_conversion_rate")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_top_reason")}
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr
              key={s.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {SURFACE_LABEL_KEYS[s.surface] ? t(SURFACE_LABEL_KEYS[s.surface]) : s.surface}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {s.sectionKey}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{s.impressionCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.clickCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.conversionCount}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(s.ctr * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(s.conversionRate * 100).toFixed(2)}%
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.topReason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
