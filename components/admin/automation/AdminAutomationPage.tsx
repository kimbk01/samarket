"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationRulesTable } from "./AutomationRulesTable";
import { AutomationLogList } from "./AutomationLogList";
import { loadAutomationFromServer } from "@/lib/automation/automation-sync-client";

type TabId = "rules" | "logs";

export function AdminAutomationPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("rules");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadAutomationFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "rules", label: t("admin_automation_tab_rules") },
    { id: "logs", label: t("admin_automation_tab_logs") },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_automation_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_automation_page_title" />
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
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "rules" && (
        <AdminCard titleKey="admin_automation_card_rules_table">
          <AutomationRulesTable />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard titleKey="admin_automation_tab_logs">
          <AutomationLogList />
        </AdminCard>
      )}
    </>
  );
}
