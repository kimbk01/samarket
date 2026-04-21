"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { QaSummaryCards } from "./QaSummaryCards";
import { QaSuiteTable } from "./QaSuiteTable";
import { QaTestCaseTable } from "./QaTestCaseTable";
import { QaPilotCheckTable } from "./QaPilotCheckTable";
import { QaIssueTable } from "./QaIssueTable";
import { QaBlockerBoard } from "./QaBlockerBoard";

type TabId =
  | "overview"
  | "cases"
  | "pilot"
  | "issues"
  | "blocker";

export function AdminQaBoardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "QA 개요" },
    { id: "cases", label: "테스트 케이스" },
    { id: "pilot", label: "파일럿 운영" },
    { id: "issues", label: "QA 이슈" },
    { id: "blocker", label: "Blocker 보드" },
  ];

  return (
    <>
      <AdminPageHeader title="최종 통합 QA" />
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
        <AdminCard title="Pass Rate · Must-Pass · 파일럿 · Go-Live QA 판정">
          <QaSummaryCards />
        </AdminCard>
      )}

      {activeTab === "cases" && (
        <>
          <AdminCard title="QA 테스트 스위트 목록">
            <QaSuiteTable />
          </AdminCard>
          <AdminCard title="테스트 케이스 실행 상태" className="mt-4">
            <QaTestCaseTable />
          </AdminCard>
        </>
      )}

      {activeTab === "pilot" && (
        <AdminCard title="실사용자 시범운영 체크리스트">
          <QaPilotCheckTable />
        </AdminCard>
      )}

      {activeTab === "issues" && (
        <AdminCard title="QA 버그/이슈 (재현 가능 placeholder)">
          <QaIssueTable />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard title="Blocker 집중 보드 (Must-Pass 강조)">
          <QaBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
