"use client";

import { useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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

  return (
    <>
      <AdminPageHeader titleKey="admin_rel_page_archive" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TAB_KEYS.map((tab) => (
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
