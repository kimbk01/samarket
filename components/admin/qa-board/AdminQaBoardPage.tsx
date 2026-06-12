"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { QA_TAB_KEYS } from "@/components/admin/i18n/admin-qa-label-keys";
import { loadQaBoardFromServer } from "@/lib/qa-board/qa-board-sync-client";
import { QaSummaryCards } from "./QaSummaryCards";
import { QaSuiteTable } from "./QaSuiteTable";
import { QaTestCaseTable } from "./QaTestCaseTable";
import { QaPilotCheckTable } from "./QaPilotCheckTable";
import { QaIssueTable } from "./QaIssueTable";
import { QaBlockerBoard } from "./QaBlockerBoard";

type TabId = keyof typeof QA_TAB_KEYS;

export function AdminQaBoardPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadQaBoardFromServer().then(() => setHydrated(true));
  }, []);

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
        <AdminPageHeader titleKey="admin_qa_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_mon_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_qa_page_title" />
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
