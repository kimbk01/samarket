"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsBenchmarkCards } from "./OpsBenchmarkCards";
import { OpsGapAnalysisCards } from "./OpsGapAnalysisCards";
import { OpsQuarterlyPlanBoard } from "./OpsQuarterlyPlanBoard";
import { OpsAdminPerformanceReviewTable } from "./OpsAdminPerformanceReviewTable";
import { OpsBenchmarkSummaryCards } from "./OpsBenchmarkSummaryCards";
import { loadOpsBenchmarksFromServer } from "@/lib/ops-benchmarks/ops-benchmarks-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";

type TabId = "benchmark" | "quarterly" | "performance" | "gap" | "summary";

export function AdminOpsBenchmarksPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("benchmark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsBenchmarksFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "benchmark", label: "벤치마크" },
    { id: "quarterly", label: "분기 계획" },
    { id: "performance", label: "성과 리뷰" },
    { id: "gap", label: "갭 분석" },
    { id: "summary", label: "요약 카드" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_benchmarks" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_mon_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_benchmarks" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />

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
