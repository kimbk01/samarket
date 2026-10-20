"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
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
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

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
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(TAB_KEYS, "summary");
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
        defaultValue="summary"
        resetParams={adminSyncTabResetParams(["release", "category", "change_type"])}
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
