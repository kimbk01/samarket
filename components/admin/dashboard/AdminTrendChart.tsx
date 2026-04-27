"use client";

import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DashboardTrendItem } from "@/lib/types/admin-dashboard";

interface AdminTrendChartProps {
  data: DashboardTrendItem[];
  title?: string;
  loading?: boolean;
}

function formatDate(s: string) {
  return s.slice(5).replace("-", "/");
}

export const AdminTrendChart = memo(function AdminTrendChart({
  data,
  title,
  loading,
}: AdminTrendChartProps) {
  const { t } = useI18n();
  const chartTitle = title ?? t("admin_dashboard_trend_default");
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [
      d.newUsers,
      d.newProducts,
      d.reports,
      d.completedTransactions,
    ])
  );

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      {chartTitle ? (
        <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{chartTitle}</h2>
      ) : null}
      <div className="space-y-2">
        {loading &&
          data.map((d) => (
            <div key={`sk-${d.date}`} className="flex items-center gap-2 sam-text-body-secondary">
              <span className="w-16 shrink-0 text-sam-muted">{formatDate(d.date)}</span>
              <div className="h-6 flex-1 animate-pulse rounded bg-sam-border" aria-hidden />
            </div>
          ))}
        {!loading &&
          data.map((d) => (
          <div key={d.date} className="flex items-center gap-2 sam-text-body-secondary">
            <span className="w-16 shrink-0 text-sam-muted">
              {formatDate(d.date)}
            </span>
            <div className="flex flex-1 gap-1">
              <div
                className="h-6 rounded bg-signature/20"
                style={{
                  width: `${(d.newProducts / maxVal) * 100}%`,
                  minWidth: d.newProducts > 0 ? "4px" : "0",
                }}
                title={t("admin_dashboard_trend_tip_product", { count: d.newProducts })}
              />
              <div
                className="h-6 rounded bg-emerald-500/30"
                style={{
                  width: `${(d.newUsers / maxVal) * 100}%`,
                  minWidth: d.newUsers > 0 ? "4px" : "0",
                }}
                title={t("admin_dashboard_trend_tip_user", { count: d.newUsers })}
              />
              <div
                className="h-6 rounded bg-amber-500/30"
                style={{
                  width: `${(d.reports / maxVal) * 100}%`,
                  minWidth: d.reports > 0 ? "4px" : "0",
                }}
                title={t("admin_dashboard_trend_tip_report", { count: d.reports })}
              />
              <div
                className="h-6 rounded bg-sam-primary-soft/30"
                style={{
                  width: `${(d.completedTransactions / maxVal) * 100}%`,
                  minWidth: d.completedTransactions > 0 ? "4px" : "0",
                }}
                title={t("admin_dashboard_trend_tip_trade", { count: d.completedTransactions })}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 sam-text-xxs text-sam-muted">
        <span>■ {t("admin_dashboard_trend_legend_product")}</span>
        <span>■ {t("admin_dashboard_trend_legend_user")}</span>
        <span>■ {t("admin_dashboard_trend_legend_report")}</span>
        <span>■ {t("admin_dashboard_trend_legend_trade")}</span>
      </div>
    </div>
  );
});

AdminTrendChart.displayName = "AdminTrendChart";
