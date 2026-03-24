"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ReleaseArchiveSummaryCards } from "./ReleaseArchiveSummaryCards";
import { ReleaseArchiveTable } from "./ReleaseArchiveTable";
import { ReleaseChangeHistoryTable } from "./ReleaseChangeHistoryTable";
import { RegressionIssueBoard } from "./RegressionIssueBoard";
import { ReleaseLearningCard } from "./ReleaseLearningCard";

type TabId = "summary" | "archive" | "change-history" | "regression" | "learning";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "요약" },
  { id: "archive", label: "릴리즈 아카이브" },
  { id: "change-history", label: "변경 이력" },
  { id: "regression", label: "회귀 보드" },
  { id: "learning", label: "릴리즈 학습" },
];

export function AdminReleaseArchivePage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  return (
    <>
      <AdminPageHeader title="릴리즈 아카이브" />
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
      {activeTab === "summary" && (
        <AdminCard title="아카이브 요약">
          <ReleaseArchiveSummaryCards />
        </AdminCard>
      )}
      {activeTab === "archive" && (
        <AdminCard title="버전별 릴리즈 아카이브">
          <ReleaseArchiveTable />
        </AdminCard>
      )}
      {activeTab === "change-history" && (
        <AdminCard title="버전별 변경 이력">
          <ReleaseChangeHistoryTable />
        </AdminCard>
      )}
      {activeTab === "regression" && (
        <AdminCard title="회귀 이슈 추적">
          <RegressionIssueBoard />
        </AdminCard>
      )}
      {activeTab === "learning" && (
        <AdminCard title="릴리즈 학습 루프">
          <ReleaseLearningCard />
        </AdminCard>
      )}
    </>
  );
}
