"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { LaunchReadinessSummaryCards } from "./LaunchReadinessSummaryCards";
import { LaunchChecklistTable } from "./LaunchChecklistTable";
import { LaunchAreaBoard } from "./LaunchAreaBoard";
import { LaunchBlockerBoard } from "./LaunchBlockerBoard";
import { LaunchApprovalTable } from "./LaunchApprovalTable";
import { loadLaunchReadinessFromServer } from "@/lib/launch-readiness/launch-readiness-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "overview" | "checklist" | "area" | "blocker" | "approval";

export function AdminLaunchReadinessPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["overview", "checklist", "area", "blocker", "approval"] as const, "overview");
  const { state: loadState, reload } = useAdminSyncLoad(loadLaunchReadinessFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_launch_readiness" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_launch_readiness_k97156b94" },
    { id: "checklist", labelKey: "admin_launch_week_checklist_2" },
    { id: "area", labelKey: "admin_launch_readiness_k016b426f" },
    { id: "blocker", labelKey: "admin_qa_tab_blocker" },
    { id: "approval", labelKey: "admin_launch_readiness_k0d1cd671" },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_launch_readiness" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="overview"
        resetParams={adminSyncTabResetParams(["phase"])}
      />

      {activeTab === "overview" && (
        <AdminCard titleKey="admin_launch_readiness_area_done_summary_2">
          <LaunchReadinessSummaryCards />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard titleKey="admin_launch_readiness_all_checklist_2">
          <LaunchChecklistTable />
        </AdminCard>
      )}

      {activeTab === "area" && (
        <AdminCard titleKey="admin_launch_readiness_area_3">
          <LaunchAreaBoard />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_launch_readiness_kead0bf4e">
          <LaunchBlockerBoard />
        </AdminCard>
      )}

      {activeTab === "approval" && (
        <AdminCard titleKey="admin_launch_readiness_approved_2">
          <LaunchApprovalTable />
        </AdminCard>
      )}
    </>
  );
}
