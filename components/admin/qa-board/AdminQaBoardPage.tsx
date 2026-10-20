"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { QA_TAB_KEYS } from "@/components/admin/i18n/admin-qa-label-keys";
import { loadQaBoardFromServer } from "@/lib/qa-board/qa-board-sync-client";
import { QaSummaryCards } from "./QaSummaryCards";
import { QaSuiteTable } from "./QaSuiteTable";
import { QaTestCaseTable } from "./QaTestCaseTable";
import { QaPilotCheckTable } from "./QaPilotCheckTable";
import { QaIssueTable } from "./QaIssueTable";
import { QaBlockerBoard } from "./QaBlockerBoard";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = keyof typeof QA_TAB_KEYS;

export function AdminQaBoardPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(Object.keys(QA_TAB_KEYS) as TabId[], "overview");
  const { state: loadState, reload } = useAdminSyncLoad(loadQaBoardFromServer);
  const hydrated = loadState.status === "ready";

  const tabs = useMemo(
    () =>
      (Object.entries(QA_TAB_KEYS) as [TabId, MessageKey][]).map(([id, labelKey]) => ({
        id,
        labelKey,
      })),
    []
  );

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_qa" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_qa" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="overview"
        resetParams={adminSyncTabResetParams(["severity", "category", "domain", "case_status", "env"])}
        className="mb-4"
      />

      {activeTab === "overview" && (
        <AdminCard titleKey="admin_qa_k7925d720">
          <QaSummaryCards />
        </AdminCard>
      )}

      {activeTab === "cases" && (
        <>
          <AdminCard titleKey="admin_qa_k87f186b1">
            <QaSuiteTable />
          </AdminCard>
          <AdminCard titleKey="admin_qa_status_3" className="mt-4">
            <QaTestCaseTable />
          </AdminCard>
        </>
      )}

      {activeTab === "pilot" && (
        <AdminCard titleKey="admin_qa_checklist_2">
          <QaPilotCheckTable />
        </AdminCard>
      )}

      {activeTab === "issues" && (
        <AdminCard titleKey="admin_qa_issues_3">
          <QaIssueTable />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_qa_ka3c87f13">
          <QaBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
