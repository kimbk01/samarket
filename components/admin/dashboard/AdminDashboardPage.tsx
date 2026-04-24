"use client";

import { useCallback, useEffect, useState } from "react";
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
      <AdminPageHeader title="대시보드" />

      {loadState === "error" && (
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="alert"
        >
          <p className="font-medium">
            운영 지표를 불러오지 못했습니다.
          </p>
          <p className="mt-1 text-sam-muted">
            Supabase 서비스 키·DB 연결·관리자 권한을 확인한 뒤 다시 시도해 주세요.
            {lastErrorAt ? ` (오류 시각 ${lastErrorAt.slice(0, 19).replace("T", " ")})` : ""}
          </p>
          <button
            type="button"
            onClick={() => load({ showLoading: true })}
            className="sam-btn sam-btn--outline sam-btn--sm mt-3"
          >
            다시 불러오기
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 sam-text-body-secondary font-medium text-sam-muted">오늘 운영 현황</h2>
        <AdminKpiCards stats={payload.stats} loading={loading} />
      </section>
      <DashboardUrgentBlock />
      <section>
        <h2 className="mb-3 sam-text-body-secondary font-medium text-sam-muted">영역별 바로가기</h2>
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
            title="일별 추이 (최근 7일)"
            loading={loading}
          />
        </div>
        <AdminNoticeCard />
      </div>
    </div>
  );
}
