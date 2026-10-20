"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { OpsRoutineSummaryCards } from "./OpsRoutineSummaryCards";
import { OpsRoutineTemplateTable } from "./OpsRoutineTemplateTable";
import { OpsRoutineExecutionTable } from "./OpsRoutineExecutionTable";
import { OpsCarryOverBoard } from "./OpsCarryOverBoard";
import { OpsMonthlyNoteList } from "./OpsMonthlyNoteList";
import { OpsOperationalizationStatusCard } from "./OpsOperationalizationStatusCard";
import { loadOpsRoutinesFromServer } from "@/lib/ops-routines/ops-routines-sync-client";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId =
  | "overview"
  | "recurring"
  | "monthly-note"
  | "operationalization"
  | "carry-over";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "overview", labelKey: "admin_ops_tools_routines_tab_overview" },
  { id: "recurring", labelKey: "admin_ops_tools_routines_tab_recurring" },
  { id: "monthly-note", labelKey: "admin_ops_tools_routines_tab_monthly" },
  { id: "operationalization", labelKey: "admin_ops_tools_routines_tab_ops_status" },
  { id: "carry-over", labelKey: "admin_ops_tools_routines_tab_carry" },
];

export function AdminOpsRoutinesPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(TABS, "overview");
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsRoutinesFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_longterm" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_longterm" />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="overview"
        resetParams={adminSyncTabResetParams(["period", "exec_status", "category", "cadence", "month"])}
        className="mb-4"
      />
      {activeTab === "overview" && (
        <AdminCard titleKey="admin_ops_tools_routines_tab_overview">
          <OpsRoutineSummaryCards />
        </AdminCard>
      )}
      {activeTab === "recurring" && (
        <div className="space-y-4">
          <AdminCard titleKey="admin_ops_tools_routines_card_templates">
            <OpsRoutineTemplateTable />
          </AdminCard>
          <AdminCard titleKey="admin_ops_tools_routines_card_executions">
            <OpsRoutineExecutionTable />
          </AdminCard>
        </div>
      )}
      {activeTab === "monthly-note" && (
        <AdminCard titleKey="admin_ops_tools_routines_card_monthly">
          <OpsMonthlyNoteList />
        </AdminCard>
      )}
      {activeTab === "operationalization" && (
        <AdminCard titleKey="admin_ops_tools_routines_card_ops_status">
          <OpsOperationalizationStatusCard />
        </AdminCard>
      )}
      {activeTab === "carry-over" && (
        <AdminCard titleKey="admin_ops_tools_routines_tab_carry">
          <OpsCarryOverBoard />
        </AdminCard>
      )}
    </>
  );
}
