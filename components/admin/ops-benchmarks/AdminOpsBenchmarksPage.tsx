"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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
  const { t } = useI18n();
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
      <AdminPageHeader titleKey="admin_ops_benchmark_k7cfc1640" />
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

      {activeTab === "benchmark" && (
        <AdminCard titleKey="admin_ops_benchmark_kb9064134">
          <OpsBenchmarkCards />
        </AdminCard>
      )}

      {activeTab === "quarterly" && (
        <AdminCard titleKey="admin_ops_benchmark_k8ce25aa7">
          <OpsQuarterlyPlanBoard />
        </AdminCard>
      )}

      {activeTab === "performance" && (
        <AdminCard titleKey="admin_ops_benchmark_admin_2">
          <OpsAdminPerformanceReviewTable />
        </AdminCard>
      )}

      {activeTab === "gap" && (
        <AdminCard titleKey="admin_ops_benchmark_priority_3">
          <OpsGapAnalysisCards />
        </AdminCard>
      )}

      {activeTab === "summary" && (
        <AdminCard titleKey="admin_launch_week_summary">
          <OpsBenchmarkSummaryCards />
        </AdminCard>
      )}
    </>
  );
}
