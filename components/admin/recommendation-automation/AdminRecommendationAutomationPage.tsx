"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AutomationSummaryCards } from "./AutomationSummaryCards";
import { AutomationPolicyTable } from "./AutomationPolicyTable";
import { EscalationRuleTable } from "./EscalationRuleTable";
import { AutomationExecutionTable } from "./AutomationExecutionTable";
import { RecoveryStateTable } from "./RecoveryStateTable";
import { AutomationSimulator } from "./AutomationSimulator";
import { loadFullRecommendationAdminState } from "@/lib/recommendation-ops/recommendation-ops-sync-client";

type TabId = "policy" | "escalation" | "executions" | "recovery" | "simulator";

const AUTO_TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "policy", labelKey: "admin_rec_auto_tab_policy" },
  { id: "escalation", labelKey: "admin_rec_auto_tab_escalation" },
  { id: "executions", labelKey: "admin_rec_auto_tab_executions" },
  { id: "recovery", labelKey: "admin_rec_auto_tab_recovery" },
  { id: "simulator", labelKey: "admin_rec_auto_tab_simulator" },
];

export function AdminRecommendationAutomationPage() {
  const { t } = useI18n();
  /** 탭은 주소 `?tab=` 보존 — 목록 필터와 함께 새로고침·링크 공유 시 유지 (R7). */
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const raw = searchParams?.get("tab") ?? "";
    return AUTO_TABS.some((tab) => tab.id === raw) ? (raw as TabId) : "policy";
  });
  const { state: loadState, reload } = useAdminSyncLoad(loadFullRecommendationAdminState);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_menu_rec_automation"
          descriptionKey="admin_rec_auto_page_desc"
        />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_menu_rec_automation"
        descriptionKey="admin_rec_auto_page_desc_db"
      />
      <div className="mb-4">
        <AutomationSummaryCards />
      </div>
      <AdminTabs
        tabs={AUTO_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="추천 자동화 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        defaultValue="policy"
        resetParams={["page", "surface"]}
        className="mb-4"
      />
      <AdminCard>
        {activeTab === "policy" && <AutomationPolicyTable />}
        {activeTab === "escalation" && <EscalationRuleTable />}
        {activeTab === "executions" && <AutomationExecutionTable />}
        {activeTab === "recovery" && <RecoveryStateTable />}
        {activeTab === "simulator" && <AutomationSimulator />}
      </AdminCard>
    </>
  );
}
