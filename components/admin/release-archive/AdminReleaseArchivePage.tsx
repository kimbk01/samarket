"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { loadReleaseArchiveFromServer } from "@/lib/release-archive/release-archive-sync-client";
import { ReleaseArchiveSummaryCards } from "./ReleaseArchiveSummaryCards";
import { ReleaseArchiveTable } from "./ReleaseArchiveTable";
import { ReleaseChangeHistoryTable } from "./ReleaseChangeHistoryTable";
import { RegressionIssueBoard } from "./RegressionIssueBoard";
import { ReleaseLearningCard } from "./ReleaseLearningCard";

type TabId = "summary" | "archive" | "change-history" | "regression" | "learning";

const TAB_KEYS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "summary", labelKey: "admin_rel_tab_summary" },
  { id: "archive", labelKey: "admin_rel_tab_archive" },
  { id: "change-history", labelKey: "admin_rel_tab_change_history" },
  { id: "regression", labelKey: "admin_rel_tab_regression" },
  { id: "learning", labelKey: "admin_rel_tab_learning" },
];

export function AdminReleaseArchivePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const { state: loadState, reload } = useAdminSyncLoad(loadReleaseArchiveFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_release_archive" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_release_archive" />
      <AdminTabs
        tabs={TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />
      {activeTab === "summary" && (
        <AdminCard titleKey="admin_rel_card_archive_summary">
          <ReleaseArchiveSummaryCards />
        </AdminCard>
      )}
      {activeTab === "archive" && (
        <AdminCard titleKey="admin_rel_card_version_archive">
          <ReleaseArchiveTable />
        </AdminCard>
      )}
      {activeTab === "change-history" && (
        <AdminCard titleKey="admin_rel_card_version_changes">
          <ReleaseChangeHistoryTable />
        </AdminCard>
      )}
      {activeTab === "regression" && (
        <AdminCard titleKey="admin_rel_card_regression">
          <RegressionIssueBoard />
        </AdminCard>
      )}
      {activeTab === "learning" && (
        <AdminCard titleKey="admin_rel_card_learning_loop">
          <ReleaseLearningCard />
        </AdminCard>
      )}
    </>
  );
}
