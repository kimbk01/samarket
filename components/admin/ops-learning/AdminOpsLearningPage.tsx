"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsLearningSummaryCards } from "./OpsLearningSummaryCards";
import { OpsLearningHistoryTable } from "./OpsLearningHistoryTable";
import { OpsIssuePatternTable } from "./OpsIssuePatternTable";
import { OpsPatternDetailPanel } from "./OpsPatternDetailPanel";
import { OpsPatternLogList } from "./OpsPatternLogList";
import { OpsResponseQualityTable } from "./OpsResponseQualityTable";
import { OpsImprovementSuggestionTable } from "./OpsImprovementSuggestionTable";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";

type TabId = "history" | "patterns" | "quality" | "suggestions" | "patternLogs";

export function AdminOpsLearningPage() {
  const [activeTab, setActiveTab] = useState<TabId>("history");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<OpsLearningStatus | "">("");
  const [patternStatusFilter, setPatternStatusFilter] = useState<OpsLearningStatus | "">("");
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: "history", label: "학습 히스토리" },
    { id: "patterns", label: "반복 패턴" },
    { id: "quality", label: "대응 품질 피드백" },
    { id: "suggestions", label: "개선 제안" },
    { id: "patternLogs", label: "패턴 로그" },
  ];

  return (
    <>
      <AdminPageHeader title="운영 학습" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
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

      {activeTab === "history" && (
        <div className="space-y-4">
          <OpsLearningSummaryCards />
          <AdminCard title="학습 히스토리">
            <div className="mb-3">
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as OpsLearningStatus | "")}
                className="rounded border border-gray-200 px-3 py-2 text-[14px]"
              >
                <option value="">전체 상태</option>
                <option value="detected">탐지</option>
                <option value="reviewing">검토중</option>
                <option value="action_created">액션생성</option>
                <option value="mitigated">완화</option>
                <option value="closed">종료</option>
              </select>
            </div>
            <OpsLearningHistoryTable statusFilter={historyStatusFilter} />
          </AdminCard>
        </div>
      )}

      {activeTab === "patterns" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
          <div className="space-y-4">
            <OpsLearningSummaryCards />
            <AdminCard title="반복 이슈 패턴">
              <div className="mb-3">
                <select
                  value={patternStatusFilter}
                  onChange={(e) => setPatternStatusFilter(e.target.value as OpsLearningStatus | "")}
                  className="rounded border border-gray-200 px-3 py-2 text-[14px]"
                >
                  <option value="">전체 상태</option>
                  <option value="detected">탐지</option>
                  <option value="reviewing">검토중</option>
                  <option value="mitigated">완화</option>
                </select>
              </div>
              <OpsIssuePatternTable
                statusFilter={patternStatusFilter}
                onSelectPattern={setSelectedPatternId}
              />
            </AdminCard>
          </div>
          <AdminCard title="패턴 상세">
            <OpsPatternDetailPanel
              patternId={selectedPatternId}
              onClose={() => setSelectedPatternId(null)}
            />
          </AdminCard>
        </div>
      )}

      {activeTab === "quality" && (
        <div className="space-y-4">
          <OpsLearningSummaryCards />
          <AdminCard title="대응 품질 피드백 (이슈·런북 결과 비교)">
            <OpsResponseQualityTable />
          </AdminCard>
        </div>
      )}

      {activeTab === "suggestions" && (
        <AdminCard title="개선 제안">
          <OpsImprovementSuggestionTable />
        </AdminCard>
      )}

      {activeTab === "patternLogs" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
          <AdminCard title="반복 패턴 (로그 확인 시 선택)">
            <OpsIssuePatternTable onSelectPattern={setSelectedPatternId} />
          </AdminCard>
          <AdminCard title="선택 패턴 로그">
            {selectedPatternId ? (
              <OpsPatternLogList patternId={selectedPatternId} />
            ) : (
              <p className="text-[14px] text-gray-500">패턴을 선택하면 로그가 표시됩니다.</p>
            )}
          </AdminCard>
        </div>
      )}
    </>
  );
}
