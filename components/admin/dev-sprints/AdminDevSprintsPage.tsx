"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { loadDevSprintsFromServer } from "@/lib/dev-sprints/dev-sprints-sync-client";
import { DevSprintSummaryCards } from "./DevSprintSummaryCards";
import { DevSprintBoard } from "./DevSprintBoard";
import { DevSprintItemTable } from "./DevSprintItemTable";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";

type TabId = "summary" | "board" | "items";

export function AdminDevSprintsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const { state: loadState, reload } = useAdminSyncLoad(loadDevSprintsFromServer);
  const hydrated = loadState.status === "ready";

  const tabs = useMemo(
    () =>
      [
        { id: "summary" as const, labelKey: "admin_dev_sprint_tab_summary" as MessageKey },
        { id: "board" as const, labelKey: "admin_dev_sprint_tab_board" as MessageKey },
        { id: "items" as const, labelKey: "admin_dev_sprint_tab_items" as MessageKey },
      ] satisfies { id: TabId; labelKey: MessageKey }[],
    []
  );

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_sprints" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_sprints" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />
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
