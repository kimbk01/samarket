"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsRoutinesFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_ops_tools_routines_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_tools_routines_page_title" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
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
