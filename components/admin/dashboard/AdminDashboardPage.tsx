"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminKpiCards } from "@/components/admin/dashboard/AdminKpiCards";
import { DashboardUrgentBlock } from "@/components/admin/dashboard/DashboardUrgentBlock";
import { DashboardQuickLinksBySection } from "@/components/admin/dashboard/DashboardQuickLinksBySection";
import { AdminStatusSummaryPanels } from "@/components/admin/dashboard/AdminStatusSummaryPanels";
import { AdminRecentActivityPanels } from "@/components/admin/dashboard/AdminRecentActivityPanels";
import { AdminTrendChart } from "@/components/admin/dashboard/AdminTrendChart";
import { AdminNoticeCard } from "@/components/admin/dashboard/AdminNoticeCard";
import {
  createEmptyDashboardPayload,
  isDashboardApiPayload,
} from "@/lib/admin-dashboard/empty-dashboard-payload";
import { mergeDashboardPayloadPreserveRefs } from "@/lib/admin-dashboard/merge-dashboard-payload-preserve-refs";
import type { DashboardPayload } from "@/lib/types/admin-dashboard";
import { fetchAdminDashboardStatsDeduped } from "@/lib/admin/fetch-admin-dashboard-stats-deduped";
type LoadState = "loading" | "ready" | "error";

export function AdminDashboardPage({
  initialDashboardPayload,
}: {
  /** RSC에서 관리자 확인 후 한 번 조회 — 클라이언트 첫 `/api/admin/stats/dashboard` 생략 */
  initialDashboardPayload?: DashboardPayload | null;
}) {
  const { t } = useI18n();
  const serverSeeded =
    initialDashboardPayload != null && isDashboardApiPayload(initialDashboardPayload);

  const [payload, setPayload] = useState<DashboardPayload>(() =>
    serverSeeded ? initialDashboardPayload : createEmptyDashboardPayload()
  );
  const [loadState, setLoadState] = useState<LoadState>(() => (serverSeeded ? "ready" : "loading"));
  const [lastErrorAt, setLastErrorAt] = useState<string | null>(null);

  const load = useCallback((options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (showLoading) setLoadState("loading");
    void fetchAdminDashboardStatsDeduped()
      .then(({ status, json }) => {
        if (status === 200 && isDashboardApiPayload(json)) {
          setPayload((prev) => mergeDashboardPayloadPreserveRefs(prev, json));
          setLoadState("ready");
          setLastErrorAt(null);
          return;
        }
        setPayload(createEmptyDashboardPayload());
        setLoadState("error");
        setLastErrorAt(new Date().toISOString());
      })
      .catch(() => {
        setPayload(createEmptyDashboardPayload());
        setLoadState("error");
        setLastErrorAt(new Date().toISOString());
      });
  }, []);

  useEffect(() => {
    if (!serverSeeded) {
      load({ showLoading: true });
    }
    const id = window.setInterval(() => load({ showLoading: false }), 30_000);
    return () => window.clearInterval(id);
  }, [load, serverSeeded]);

  const loading = loadState === "loading";

  return (
    <div className="sam-page-stack">
      <AdminPageHeader titleKey="admin_menu_dashboard" />

      {loadState === "error" && (
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="alert"
        >
          <p className="font-medium">
            {t("admin_dashboard_stats_error_title")}
          </p>
          <p className="mt-1 text-sam-muted">
            {t("admin_dashboard_stats_error_hint")}
            {lastErrorAt
              ? ` (${t("admin_dashboard_stats_error_time")} ${lastErrorAt.slice(0, 19).replace("T", " ")})`
              : ""}
          </p>
          <button
            type="button"
            onClick={() => load({ showLoading: true })}
            className="sam-btn sam-btn--outline sam-btn--sm mt-3"
          >
            {t("admin_dashboard_retry")}
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 sam-text-body-secondary font-medium text-sam-muted">
          {t("admin_dashboard_section_today")}
        </h2>
        <AdminKpiCards stats={payload.stats} loading={loading} />
      </section>
      <DashboardUrgentBlock />
      <section>
        <h2 className="mb-3 sam-text-body-secondary font-medium text-sam-muted">
          {t("admin_dashboard_section_shortcuts")}
        </h2>
        <DashboardQuickLinksBySection />
      </section>
      <AdminStatusSummaryPanels
        product={payload.productSummary}
        user={payload.userSummary}
        report={payload.reportSummary}
        chat={payload.chatSummary}
        loading={loading}
      />
      <AdminRecentActivityPanels
        products={payload.recentProducts}
        users={payload.recentUsers}
        reports={payload.recentReports}
        chats={payload.recentChats}
        reviews={payload.recentReviews}
        loading={loading}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AdminTrendChart
            data={payload.trend}
            title={t("admin_dashboard_trend_7d")}
            loading={loading}
          />
        </div>
        <AdminNoticeCard />
      </div>
    </div>
  );
}
