"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getRecommendationAnalyticsSummary } from "@/lib/recommendation/mock-recommendation-analytics-summary";
import { RecommendationSummaryCards } from "./RecommendationSummaryCards";
import { RecommendationPerformanceTable } from "./RecommendationPerformanceTable";
import { BehaviorEventTable } from "./BehaviorEventTable";
import { UserBehaviorInsightTable } from "./UserBehaviorInsightTable";
import { RecentViewedAdminTable } from "./RecentViewedAdminTable";

type TabId = "events" | "recent" | "performance" | "insight";

const TABS: { id: TabId; label: string }[] = [
  { id: "events", label: "이벤트 로그" },
  { id: "recent", label: "최근 본 상품" },
  { id: "performance", label: "추천 성과 분석" },
  { id: "insight", label: "사용자 행동 인사이트" },
];

export function AdminRecommendationAnalyticsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>("performance");

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  const summaries = useMemo(() => getRecommendationAnalyticsSummary(), []);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="추천·행동 분석" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === t.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "events" && (
        <AdminCard title="사용자 행동 이벤트 로그">
          <BehaviorEventTable />
        </AdminCard>
      )}

      {activeTab === "recent" && (
        <AdminCard title="최근 본 상품 (전체)">
          <RecentViewedAdminTable />
        </AdminCard>
      )}

      {activeTab === "performance" && (
        <>
          <AdminCard title="추천 품질 요약">
            <RecommendationSummaryCards summaries={summaries} />
          </AdminCard>
          <AdminCard title="추천 소스별 성과">
            <RecommendationPerformanceTable summaries={summaries} />
          </AdminCard>
        </>
      )}

      {activeTab === "insight" && (
        <AdminCard title="사용자 행동 인사이트">
          <UserBehaviorInsightTable />
        </AdminCard>
      )}
    </div>
  );
}
