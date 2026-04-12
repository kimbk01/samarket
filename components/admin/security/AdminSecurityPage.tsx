"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { SecuritySummaryCards } from "./SecuritySummaryCards";
import { SecurityCheckTable } from "./SecurityCheckTable";
import { SecurityIssueList } from "./SecurityIssueList";

type TabId = "summary" | "checks" | "issues";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "보안 상태 요약" },
  { id: "checks", label: "점검 리스트" },
  { id: "issues", label: "이슈 목록" },
];

export function AdminSecurityPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  return (
    <>
      <AdminPageHeader title="보안 / 권한 / RLS 점검" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
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
      {activeTab === "summary" && (
        <AdminCard title="보안 상태 요약">
          <SecuritySummaryCards />
        </AdminCard>
      )}
      {activeTab === "checks" && (
        <AdminCard title="RLS / API / 권한 점검 리스트">
          <SecurityCheckTable />
        </AdminCard>
      )}
      {activeTab === "issues" && (
        <AdminCard title="보안 이슈 목록">
          <SecurityIssueList />
        </AdminCard>
      )}
    </>
  );
}
