"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { DevSprintSummaryCards } from "./DevSprintSummaryCards";
import { DevSprintBoard } from "./DevSprintBoard";
import { DevSprintItemTable } from "./DevSprintItemTable";

type TabId = "summary" | "board" | "items";

export function AdminDevSprintsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const tabs = useMemo(
    () =>
      [
        { id: "summary" as const, labelKey: "admin_dev_sprint_tab_summary" as MessageKey },
        { id: "board" as const, labelKey: "admin_dev_sprint_tab_board" as MessageKey },
        { id: "items" as const, labelKey: "admin_dev_sprint_tab_items" as MessageKey },
      ] satisfies { id: TabId; labelKey: MessageKey }[],
    []
  );

  return (
    <>
      <AdminPageHeader titleKey="admin_dev_sprint_page_title" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
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
        <AdminCard titleKey="admin_dev_sprint_card_summary">
          <DevSprintSummaryCards />
        </AdminCard>
      )}
      {activeTab === "board" && (
        <AdminCard titleKey="admin_dev_sprint_card_board">
          <DevSprintBoard />
        </AdminCard>
      )}
      {activeTab === "items" && (
        <AdminCard titleKey="admin_dev_sprint_card_items">
          <DevSprintItemTable />
        </AdminCard>
      )}
    </>
  );
}
