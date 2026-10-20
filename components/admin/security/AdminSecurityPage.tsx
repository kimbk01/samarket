"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { SecuritySummaryCards } from "./SecuritySummaryCards";
import { SecurityCheckTable } from "./SecurityCheckTable";
import { SecurityIssueList } from "./SecurityIssueList";
import { loadSecurityOpsFromServer } from "@/lib/security/security-sync-client";

type TabId = "summary" | "checks" | "issues";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "summary", labelKey: "admin_security_status_summary_2" },
  { id: "checks", labelKey: "admin_security_k043f6998" },
  { id: "issues", labelKey: "admin_security_k971de5cf" },
];

export function AdminSecurityPage() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadSecurityOpsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_security" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_security" />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
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
