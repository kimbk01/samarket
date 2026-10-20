"use client";


import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { getRecommendationAnalyticsSummary } from "@/lib/recommendation/recommendation-analytics-summary";
import { RecommendationSummaryCards } from "./RecommendationSummaryCards";
import { RecommendationPerformanceTable } from "./RecommendationPerformanceTable";
import { BehaviorEventTable } from "./BehaviorEventTable";
import { UserBehaviorInsightTable } from "./UserBehaviorInsightTable";
import { RecentViewedAdminTable } from "./RecentViewedAdminTable";
import { loadRecommendationAnalyticsFromServer } from "@/lib/recommendation-analytics/recommendation-analytics-sync-client";

type TabId = "events" | "recent" | "performance" | "insight";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "events", labelKey: "admin_rec_analytics_k6751fbfa" },
  { id: "recent", labelKey: "admin_rec_analytics_k8693f28e" },
  { id: "performance", labelKey: "admin_rec_analytics_kfa0e1a4e" },
  { id: "insight", labelKey: "admin_rec_analytics_k93f128e1" },
];

export function AdminRecommendationAnalyticsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>("performance");
  const { state: loadState, reload } = useAdminSyncLoad(loadRecommendationAnalyticsFromServer);
  const hydrated = loadState.status === "ready";

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  const summaries = useMemo(() => getRecommendationAnalyticsSummary(), [hydrated]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_menu_rec_analytics" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_rec_analytics" />

      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="추천 분석 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
      />

      {activeTab === "events" && (
        <AdminCard titleKey="admin_rec_analytics_k6751fbfa">
          <BehaviorEventTable />
        </AdminCard>
      )}

      {activeTab === "recent" && (
        <AdminCard titleKey="admin_rec_analytics_all_2">
          <RecentViewedAdminTable />
        </AdminCard>
      )}

      {activeTab === "performance" && (
        <>
          <AdminCard titleKey="admin_rec_analytics_summary_2">
            <RecommendationSummaryCards summaries={summaries} />
          </AdminCard>
          <AdminCard titleKey="admin_rec_analytics_kd7474f15">
            <RecommendationPerformanceTable summaries={summaries} />
          </AdminCard>
        </>
      )}

      {activeTab === "insight" && (
        <AdminCard titleKey="admin_rec_analytics_k93f128e1">
          <UserBehaviorInsightTable />
        </AdminCard>
      )}
    </div>
  );
}
