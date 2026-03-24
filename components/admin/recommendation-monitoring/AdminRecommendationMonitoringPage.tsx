"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { HealthSummaryCards } from "./HealthSummaryCards";
import { SurfaceHealthTable } from "./SurfaceHealthTable";
import { SectionHealthTable } from "./SectionHealthTable";
import { IncidentTable } from "./IncidentTable";
import { AlertRuleTable } from "./AlertRuleTable";
import { AlertEventTable } from "./AlertEventTable";
import { MonitoringTimeline } from "./MonitoringTimeline";
import { OpsKnowledgeRecommendationPanel } from "@/components/admin/ops-knowledge/OpsKnowledgeRecommendationPanel";

type TabId =
  | "dashboard"
  | "sections"
  | "incidents"
  | "rules"
  | "events";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "헬스 대시보드" },
  { id: "sections", label: "섹션 상태" },
  { id: "incidents", label: "운영 이슈" },
  { id: "rules", label: "알림 규칙" },
  { id: "events", label: "알림 이벤트" },
];

export function AdminRecommendationMonitoringPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <>
      <AdminPageHeader
        title="추천 운영 모니터링"
        description="헬스·섹션·이슈·알림 규칙·알림 이벤트"
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "dashboard" && (
        <>
          <div className="mb-4">
            <HealthSummaryCards />
          </div>
          <AdminCard title="최근 이벤트 타임라인" className="mb-4">
            <MonitoringTimeline />
          </AdminCard>
          <AdminCard title="Surface 헬스">
            <SurfaceHealthTable />
          </AdminCard>
        </>
      )}
      {activeTab === "sections" && (
        <AdminCard title="섹션별 상태">
          <SectionHealthTable />
        </AdminCard>
      )}
      {activeTab === "incidents" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,280px]">
          <AdminCard title="운영 이슈">
            <IncidentTable />
          </AdminCard>
          <OpsKnowledgeRecommendationPanel
            sourceType="incident"
            sourceId={null}
            title="이슈 관련 문서"
            compact
          />
        </div>
      )}
      {activeTab === "rules" && (
        <AdminCard title="알림 규칙 (채널 placeholder: email / slack / sms / dashboard_only)">
          <AlertRuleTable />
        </AdminCard>
      )}
      {activeTab === "events" && (
        <AdminCard title="알림 이벤트">
          <AlertEventTable />
        </AdminCard>
      )}
    </>
  );
}
