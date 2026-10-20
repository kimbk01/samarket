"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationRulesTable } from "./AutomationRulesTable";
import { AutomationLogList } from "./AutomationLogList";
import { loadAutomationFromServer } from "@/lib/automation/automation-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";

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
        <AdminPageHeader titleKey="admin_menu_dev_automation" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_automation" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />
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
