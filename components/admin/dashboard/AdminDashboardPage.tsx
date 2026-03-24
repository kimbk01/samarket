"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminKpiCards } from "@/components/admin/dashboard/AdminKpiCards";
import { DashboardUrgentBlock } from "@/components/admin/dashboard/DashboardUrgentBlock";
import { DashboardQuickLinksBySection } from "@/components/admin/dashboard/DashboardQuickLinksBySection";
import { AdminStatusSummaryPanels } from "@/components/admin/dashboard/AdminStatusSummaryPanels";
import { AdminRecentActivityPanels } from "@/components/admin/dashboard/AdminRecentActivityPanels";
import { AdminTrendChart } from "@/components/admin/dashboard/AdminTrendChart";
import { AdminNoticeCard } from "@/components/admin/dashboard/AdminNoticeCard";
import { getDashboardStats } from "@/lib/admin-dashboard/mock-dashboard-stats";
import {
  getProductStatusSummary,
  getUserStatusSummary,
  getReportStatusSummary,
  getChatStatusSummary,
} from "@/lib/admin-dashboard/mock-dashboard-summaries";
import {
  getRecentProducts,
  getRecentUsers,
  getRecentReports,
  getRecentChats,
  getRecentReviews,
} from "@/lib/admin-dashboard/mock-dashboard-activity";
import { getDashboardTrend } from "@/lib/admin-dashboard/mock-dashboard-trends";
import type {
  DashboardStats,
  ProductStatusSummary,
  ReportStatusSummary,
  ChatStatusSummary,
  RecentProduct,
  RecentUser,
  RecentReport,
  RecentChat,
  RecentReview,
  DashboardTrendItem,
  UserStatusSummary,
} from "@/lib/types/admin-dashboard";
import { fetchAdminDashboardStatsDeduped } from "@/lib/admin/fetch-admin-dashboard-stats-deduped";

type DashboardPayload = {
  stats: DashboardStats;
  productSummary: ProductStatusSummary;
  userSummary: UserStatusSummary;
  reportSummary: ReportStatusSummary;
  chatSummary: ChatStatusSummary;
  recentProducts: RecentProduct[];
  recentUsers: RecentUser[];
  recentReports: RecentReport[];
  recentChats: RecentChat[];
  recentReviews: RecentReview[];
  trend: DashboardTrendItem[];
};

export function AdminDashboardPage() {
  const initialPayload = (): DashboardPayload => ({
    stats: getDashboardStats(),
    productSummary: getProductStatusSummary(),
    userSummary: getUserStatusSummary(),
    reportSummary: getReportStatusSummary(),
    chatSummary: getChatStatusSummary(),
    recentProducts: getRecentProducts(),
    recentUsers: getRecentUsers(),
    recentReports: getRecentReports(),
    recentChats: getRecentChats(),
    recentReviews: getRecentReviews(),
    trend: getDashboardTrend(7),
  });

  const [payload, setPayload] = useState<DashboardPayload>(() => initialPayload());

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchAdminDashboardStatsDeduped()
        .then(({ json: d }) => {
          if (!alive || d == null || typeof d !== "object") return;
          setPayload(d as DashboardPayload);
        })
        .catch(() => {
          /* keep mock */
        });
    };

    load();
    const id = window.setInterval(load, 30000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="대시보드" />
      <section>
        <h2 className="mb-3 text-[13px] font-medium text-gray-500">
          오늘 운영 현황
        </h2>
        <AdminKpiCards stats={payload.stats} />
      </section>
      <DashboardUrgentBlock />
      <section>
        <h2 className="mb-3 text-[13px] font-medium text-gray-500">
          영역별 바로가기
        </h2>
        <DashboardQuickLinksBySection />
      </section>
      <AdminStatusSummaryPanels
        product={payload.productSummary}
        user={payload.userSummary}
        report={payload.reportSummary}
        chat={payload.chatSummary}
      />
      <AdminRecentActivityPanels
        products={payload.recentProducts}
        users={payload.recentUsers}
        reports={payload.recentReports}
        chats={payload.recentChats}
        reviews={payload.recentReviews}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AdminTrendChart data={payload.trend} title="일별 추이 (최근 7일)" />
        </div>
        <AdminNoticeCard />
      </div>
    </div>
  );
}
