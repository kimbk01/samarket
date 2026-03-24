"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsBenchmarkCards } from "./OpsBenchmarkCards";
import { OpsGapAnalysisCards } from "./OpsGapAnalysisCards";
import { OpsQuarterlyPlanBoard } from "./OpsQuarterlyPlanBoard";
import { OpsAdminPerformanceReviewTable } from "./OpsAdminPerformanceReviewTable";
import { OpsBenchmarkSummaryCards } from "./OpsBenchmarkSummaryCards";

type TabId = "benchmark" | "quarterly" | "performance" | "gap" | "summary";

export function AdminOpsBenchmarksPage() {
  const [activeTab, setActiveTab] = useState<TabId>("benchmark");

  const tabs: { id: TabId; label: string }[] = [
    { id: "benchmark", label: "벤치마크" },
    { id: "quarterly", label: "분기 계획" },
    { id: "performance", label: "성과 리뷰" },
    { id: "gap", label: "갭 분석" },
    { id: "summary", label: "요약 카드" },
  ];

  return (
    <>
      <AdminPageHeader title="운영 벤치마크" />
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

      {activeTab === "benchmark" && (
        <AdminCard title="내부 운영 기준 벤치마크 (현재 vs 목표 vs 기준)">
          <OpsBenchmarkCards />
        </AdminCard>
      )}

      {activeTab === "quarterly" && (
        <AdminCard title="분기별 개선 계획">
          <OpsQuarterlyPlanBoard />
        </AdminCard>
      )}

      {activeTab === "performance" && (
        <AdminCard title="관리자 성과 리뷰">
          <OpsAdminPerformanceReviewTable />
        </AdminCard>
      )}

      {activeTab === "gap" && (
        <AdminCard title="벤치마크 갭 분석 · 개선 우선순위 추천">
          <OpsGapAnalysisCards />
        </AdminCard>
      )}

      {activeTab === "summary" && (
        <AdminCard title="요약">
          <OpsBenchmarkSummaryCards />
        </AdminCard>
      )}
    </>
  );
}
