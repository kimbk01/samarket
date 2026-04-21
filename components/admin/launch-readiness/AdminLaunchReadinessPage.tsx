"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { LaunchReadinessSummaryCards } from "./LaunchReadinessSummaryCards";
import { LaunchChecklistTable } from "./LaunchChecklistTable";
import { LaunchAreaBoard } from "./LaunchAreaBoard";
import { LaunchBlockerBoard } from "./LaunchBlockerBoard";
import { LaunchApprovalTable } from "./LaunchApprovalTable";

type TabId = "overview" | "checklist" | "area" | "blocker" | "approval";

export function AdminLaunchReadinessPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Readiness 개요" },
    { id: "checklist", label: "체크리스트" },
    { id: "area", label: "영역 보드" },
    { id: "blocker", label: "Blocker 보드" },
    { id: "approval", label: "승인" },
  ];

  return (
    <>
      <AdminPageHeader title="런칭 준비" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
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
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <AdminCard title="Readiness 점수 · 영역별 완료율 · Go/No-Go 요약">
          <LaunchReadinessSummaryCards />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard title="전체 서비스 마감 점검 체크리스트">
          <LaunchChecklistTable />
        </AdminCard>
      )}

      {activeTab === "area" && (
        <AdminCard title="영역별 Readiness (Pre-Launch / Launch Day / Post-Launch)">
          <LaunchAreaBoard />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard title="Blocker 집중 보드">
          <LaunchBlockerBoard />
        </AdminCard>
      )}

      {activeTab === "approval" && (
        <AdminCard title="런칭 승인 (승인자 placeholder)">
          <LaunchApprovalTable />
        </AdminCard>
      )}
    </>
  );
}
