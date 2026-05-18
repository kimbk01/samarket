"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { SecuritySummaryCards } from "./SecuritySummaryCards";
import { SecurityCheckTable } from "./SecurityCheckTable";
import { SecurityIssueList } from "./SecurityIssueList";

type TabId = "summary" | "checks" | "issues";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", labelKey: "admin_security_status_summary_2" as const },
  { id: "checks", label: "점검 리스트" },
  { id: "issues", label: "이슈 목록" },
];

export function AdminSecurityPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  return (
    <>
      <AdminPageHeader titleKey="admin_security_k1c4bd70f" />
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
            {tab.label}
          </button>
        ))}
      </div>
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
