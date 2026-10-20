"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationRulesTable } from "./AutomationRulesTable";
import { AutomationLogList } from "./AutomationLogList";
import { loadAutomationFromServer } from "@/lib/automation/automation-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "rules" | "logs";

export function AdminAutomationPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["rules", "logs"] as const, "rules");
  const { state: loadState, reload } = useAdminSyncLoad(loadAutomationFromServer);
  const hydrated = loadState.status === "ready";

  const tabs: { id: TabId; label: string }[] = [
    { id: "rules", label: t("admin_automation_tab_rules") },
    { id: "logs", label: t("admin_automation_tab_logs") },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_automation" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
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
        defaultValue="rules"
        resetParams={adminSyncTabResetParams([])}
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
