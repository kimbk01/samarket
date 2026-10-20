"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { loadLaunchWeekFromServer } from "@/lib/launch-week/launch-week-sync-client";
import { LaunchWeekSummaryCards } from "./LaunchWeekSummaryCards";
import { LaunchWeekKpiTable } from "./LaunchWeekKpiTable";
import { LaunchWeekChecklistTable } from "./LaunchWeekChecklistTable";
import { LaunchWeekIssueBoard } from "./LaunchWeekIssueBoard";
import { LaunchWeekDailyNoteList } from "./LaunchWeekDailyNoteList";
import { LaunchWeekBlockerBoard } from "./LaunchWeekBlockerBoard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId =
  | "overview"
  | "kpi"
  | "checklist"
  | "issues"
  | "daily"
  | "blocker";

export function AdminLaunchWeekPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["overview", "kpi", "checklist", "issues", "daily", "blocker"] as const, "overview");
  const { state: loadState, reload } = useAdminSyncLoad(loadLaunchWeekFromServer);
  const hydrated = loadState.status === "ready";

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_launch_week_k14765c91" },
    { id: "kpi", labelKey: "admin_launch_week_open_4" },
    { id: "checklist", labelKey: "admin_launch_week_checklist_2" },
    { id: "issues", labelKey: "admin_launch_week_k24f5e606" },
    { id: "daily", labelKey: "admin_launch_week_k01fce460" },
    { id: "blocker", labelKey: "admin_qa_tab_blocker" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_launch_week" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_launch_week" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="overview"
        resetParams={adminSyncTabResetParams(["day", "date"])}
      />

      {activeTab === "overview" && (
        <AdminCard titleKey="admin_launch_week_status_checklist_issues_2">
          <LaunchWeekSummaryCards />
        </AdminCard>
      )}

      {activeTab === "kpi" && (
        <AdminCard titleKey="admin_launch_week_open_4">
          <LaunchWeekKpiTable />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard titleKey="admin_launch_week_checklist_3">
          <LaunchWeekChecklistTable />
        </AdminCard>
      )}

      {activeTab === "issues" && (
        <AdminCard titleKey="admin_launch_week_critical_issues_2">
          <LaunchWeekIssueBoard />
        </AdminCard>
      )}

      {activeTab === "daily" && (
        <AdminCard titleKey="admin_launch_week_k01fce460">
          <LaunchWeekDailyNoteList />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_launch_week_blocked_checklist_3">
          <LaunchWeekBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
