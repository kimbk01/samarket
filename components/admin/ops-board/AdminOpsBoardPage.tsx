"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsActionSummaryCards } from "./OpsActionSummaryCards";
import { OpsChecklistTable } from "./OpsChecklistTable";
import { OpsChecklistTemplateTable } from "./OpsChecklistTemplateTable";
import { OpsRetrospectiveList } from "./OpsRetrospectiveList";
import { OpsRetrospectiveForm } from "./OpsRetrospectiveForm";
import { OpsActionBoard } from "./OpsActionBoard";
import { loadOpsBoardFromServer } from "@/lib/ops-board/ops-board-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";

type TabId =
  | "summary"
  | "checklist"
  | "templates"
  | "retro"
  | "actions";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "summary", labelKey: "admin_ops_tools_board_tab_summary" },
  { id: "checklist", labelKey: "admin_ops_tools_board_tab_checklist" },
  { id: "templates", labelKey: "admin_ops_tools_board_tab_templates" },
  { id: "retro", labelKey: "admin_ops_tools_board_tab_retro" },
  { id: "actions", labelKey: "admin_ops_tools_board_tab_actions" },
];

export function AdminOpsBoardPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [retroRefresh, setRetroRefresh] = useState(0);
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsBoardFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_menu_manage_ops_board"
          descriptionKey="admin_ops_tools_board_page_desc"
        />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_menu_manage_ops_board"
        descriptionKey="admin_ops_tools_board_page_desc"
      />
      <AdminTabs
        className="mb-4"
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />
      {activeTab === "summary" && (
        <AdminCard titleKey="admin_ops_tools_board_card_summary">
          <OpsActionSummaryCards />
        </AdminCard>
      )}
      {activeTab === "checklist" && (
        <AdminCard titleKey="admin_ops_tools_board_card_checklist">
          <OpsChecklistTable />
        </AdminCard>
      )}
      {activeTab === "templates" && (
        <AdminCard titleKey="admin_ops_tools_board_card_templates">
          <OpsChecklistTemplateTable />
        </AdminCard>
      )}
      {activeTab === "retro" && (
        <div className="space-y-4">
          <OpsRetrospectiveForm onSaved={() => setRetroRefresh((r) => r + 1)} />
          <AdminCard titleKey="admin_ops_tools_board_card_retro_list">
            <OpsRetrospectiveList refreshKey={retroRefresh} />
          </AdminCard>
        </div>
      )}
      {activeTab === "actions" && (
        <AdminCard titleKey="admin_ops_tools_board_card_actions">
          <OpsActionBoard />
        </AdminCard>
      )}
    </>
  );
}
