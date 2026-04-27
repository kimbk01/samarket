"use client";

import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { DashboardStats } from "@/lib/types/admin-dashboard";

interface AdminKpiCardsProps {
  stats: DashboardStats;
  /** true이면 숫자 대신 스켈레톤 (mock KPI와 구분) */
  loading?: boolean;
}

const CARDS: { key: keyof DashboardStats; labelKey: MessageKey }[] = [
  { key: "totalUsers", labelKey: "admin_dashboard_kpi_total_users" },
  { key: "activeProducts", labelKey: "admin_dashboard_kpi_active_products" },
  { key: "totalFavorites", labelKey: "admin_dashboard_kpi_total_favorites" },
  { key: "newProductsToday", labelKey: "admin_dashboard_kpi_new_products_today" },
  { key: "newUsersToday", labelKey: "admin_dashboard_kpi_new_users_today" },
  { key: "pendingReports", labelKey: "admin_dashboard_kpi_pending_reports" },
  { key: "chatsToday", labelKey: "admin_dashboard_kpi_chats_today" },
  { key: "completedTransactions", labelKey: "admin_dashboard_kpi_completed_trades" },
  { key: "averageTrustScore", labelKey: "admin_dashboard_kpi_avg_trust" },
];

export const AdminKpiCards = memo(function AdminKpiCards({ stats, loading }: AdminKpiCardsProps) {
  const { t } = useI18n();
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-busy={loading ? true : undefined}
    >
      {CARDS.map(({ key, labelKey }) => {
        const value = stats[key];
        const display =
          typeof value === "number" && key === "averageTrustScore"
            ? value.toFixed(1)
            : String(value);
        return (
          <div
            key={key}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
          >
            <p className="sam-text-helper text-sam-muted">{t(labelKey)}</p>
            <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
              {loading ? (
                <span
                  className="inline-block h-[1.125rem] w-[3.5rem] animate-pulse rounded bg-sam-border"
                  aria-hidden
                />
              ) : (
                display
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
});

AdminKpiCards.displayName = "AdminKpiCards";
