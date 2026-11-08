"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsBenchmarkCards } from "./OpsBenchmarkCards";
import { OpsGapAnalysisCards } from "./OpsGapAnalysisCards";
import { OpsQuarterlyPlanBoard } from "./OpsQuarterlyPlanBoard";
import { OpsAdminPerformanceReviewTable } from "./OpsAdminPerformanceReviewTable";
import { OpsBenchmarkSummaryCards } from "./OpsBenchmarkSummaryCards";
import { loadOpsBenchmarksFromServer } from "@/lib/ops-benchmarks/ops-benchmarks-sync-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "benchmark" | "quarterly" | "performance" | "gap" | "summary";

export function AdminOpsBenchmarksPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["benchmark", "quarterly", "performance", "gap", "summary"] as const, "benchmark");
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsBenchmarksFromServer);
  const hydrated = loadState.status === "ready";

  const tabs: { id: TabId; label: MessageKey }[] = [
    { id: "benchmark", label: "admin_ops_bench_tab_benchmark" },
    { id: "quarterly", label: "admin_ops_bench_tab_quarterly" },
    { id: "performance", label: "admin_ops_bench_tab_performance" },
    { id: "gap", label: "admin_ops_bench_tab_gap" },
    { id: "summary", label: "admin_ops_bench_tab_summary" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_benchmarks" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_benchmarks" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.label) }))}
        ariaLabel={t("admin_screen_tabs_aria")}
        defaultValue="benchmark"
        resetParams={adminSyncTabResetParams(["scope", "domain"])}
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
