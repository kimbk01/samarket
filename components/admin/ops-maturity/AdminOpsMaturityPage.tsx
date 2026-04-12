"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsMaturityScoreCards } from "./OpsMaturityScoreCards";
import { OpsTeamKpiTable } from "./OpsTeamKpiTable";
import { OpsRoadmapBoard } from "./OpsRoadmapBoard";
import { OpsMaturityHistoryChart } from "./OpsMaturityHistoryChart";
import { OpsImprovementSummaryCards } from "./OpsImprovementSummaryCards";

type TabId = "scores" | "kpi" | "roadmap" | "history" | "summary";

export function AdminOpsMaturityPage() {
  const [activeTab, setActiveTab] = useState<TabId>("scores");

  const tabs: { id: TabId; label: string }[] = [
    { id: "scores", label: "성숙도 점수" },
    { id: "kpi", label: "KPI" },
    { id: "roadmap", label: "로드맵 보드" },
    { id: "history", label: "히스토리" },
    { id: "summary", label: "요약 카드" },
  ];

  return (
    <>
      <AdminPageHeader title="운영 성숙도" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "scores" && (
        <AdminCard title="영역별 성숙도 (목표 점수 설정 가능)">
          <OpsMaturityScoreCards />
        </AdminCard>
      )}

      {activeTab === "kpi" && (
        <AdminCard title="팀 운영 KPI (이번 주 vs 지난 주 / 이번 달 vs 지난 달)">
          <OpsTeamKpiTable />
        </AdminCard>
      )}

      {activeTab === "roadmap" && (
        <AdminCard title="운영 개선 로드맵">
          <OpsRoadmapBoard />
        </AdminCard>
      )}

      {activeTab === "history" && (
        <AdminCard title="성숙도 히스토리 (차트 placeholder)">
          <OpsMaturityHistoryChart />
        </AdminCard>
      )}

      {activeTab === "summary" && (
        <AdminCard title="개선 요약">
          <OpsImprovementSummaryCards />
        </AdminCard>
      )}
    </>
  );
}
