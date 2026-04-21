"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { LaunchWeekSummaryCards } from "./LaunchWeekSummaryCards";
import { LaunchWeekKpiTable } from "./LaunchWeekKpiTable";
import { LaunchWeekChecklistTable } from "./LaunchWeekChecklistTable";
import { LaunchWeekIssueBoard } from "./LaunchWeekIssueBoard";
import { LaunchWeekDailyNoteList } from "./LaunchWeekDailyNoteList";
import { LaunchWeekBlockerBoard } from "./LaunchWeekBlockerBoard";

type TabId =
  | "overview"
  | "kpi"
  | "checklist"
  | "issues"
  | "daily"
  | "blocker";

export function AdminLaunchWeekPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Week 개요" },
    { id: "kpi", label: "KPI" },
    { id: "checklist", label: "체크리스트" },
    { id: "issues", label: "이슈 보드" },
    { id: "daily", label: "Daily Note" },
    { id: "blocker", label: "Blocker" },
  ];

  return (
    <>
      <AdminPageHeader title="오픈 직후 첫 주" />
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
        <AdminCard title="초기 안정화 상태 · 이슈 · 체크리스트 · Fallback/Kill Switch">
          <LaunchWeekSummaryCards />
        </AdminCard>
      )}

      {activeTab === "kpi" && (
        <AdminCard title="오픈 후 Day 1~7 핵심 KPI">
          <LaunchWeekKpiTable />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard title="첫 주 Must-Watch · 안정화 체크리스트">
          <LaunchWeekChecklistTable />
        </AdminCard>
      )}

      {activeTab === "issues" && (
        <AdminCard title="긴급 이슈 리스트">
          <LaunchWeekIssueBoard />
        </AdminCard>
      )}

      {activeTab === "daily" && (
        <AdminCard title="Day별 Summary Note">
          <LaunchWeekDailyNoteList />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard title="Blocker 강조 (차단 체크리스트)">
          <LaunchWeekBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
