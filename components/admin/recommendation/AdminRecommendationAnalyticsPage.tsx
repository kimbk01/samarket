"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadRecommendationAnalyticsFromServer().then(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  const summaries = useMemo(() => getRecommendationAnalyticsSummary(), [hydrated]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_rec_analytics_k4f5d75ab" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_rec_analytics_k4f5d75ab" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

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
