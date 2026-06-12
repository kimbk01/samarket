"use client";

import { useEffect, useState } from "react";
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsBoardFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_ops_tools_board_page_title"
          descriptionKey="admin_ops_tools_board_page_desc"
        />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_ops_tools_board_page_title"
        descriptionKey="admin_ops_tools_board_page_desc"
      />
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
