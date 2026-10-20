"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { OpsRoutineSummaryCards } from "./OpsRoutineSummaryCards";
import { OpsRoutineTemplateTable } from "./OpsRoutineTemplateTable";
import { OpsRoutineExecutionTable } from "./OpsRoutineExecutionTable";
import { OpsCarryOverBoard } from "./OpsCarryOverBoard";
import { OpsMonthlyNoteList } from "./OpsMonthlyNoteList";
import { OpsOperationalizationStatusCard } from "./OpsOperationalizationStatusCard";
import { loadOpsRoutinesFromServer } from "@/lib/ops-routines/ops-routines-sync-client";

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
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsRoutinesFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_longterm" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_longterm" />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
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
