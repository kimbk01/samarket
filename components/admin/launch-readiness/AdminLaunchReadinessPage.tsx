"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
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

type TabId = "overview" | "checklist" | "area" | "blocker" | "approval";

export function AdminLaunchReadinessPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
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
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
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
