"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { SecuritySummaryCards } from "./SecuritySummaryCards";
import { SecurityCheckTable } from "./SecurityCheckTable";
import { SecurityIssueList } from "./SecurityIssueList";
import { loadSecurityOpsFromServer } from "@/lib/security/security-sync-client";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "summary" | "checks" | "issues";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "summary", labelKey: "admin_security_status_summary_2" },
  { id: "checks", labelKey: "admin_security_k043f6998" },
  { id: "issues", labelKey: "admin_security_k971de5cf" },
];

export function AdminSecurityPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(TABS, "summary");
  const { state: loadState, reload } = useAdminSyncLoad(loadSecurityOpsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_security" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_security" />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="summary"
        resetParams={adminSyncTabResetParams(["type", "issue_status"])}
        className="mb-4"
      />
      {activeTab === "summary" && (
        <AdminCard titleKey="admin_security_status_summary_2">
          <SecuritySummaryCards />
        </AdminCard>
      )}
      {activeTab === "checks" && (
        <AdminCard titleKey="admin_security_k4fb870ce">
          <SecurityCheckTable />
        </AdminCard>
      )}
      {activeTab === "issues" && (
        <AdminCard titleKey="admin_security_issues_3">
          <SecurityIssueList />
        </AdminCard>
      )}
    </>
  );
}
