"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadFullRecommendationAdminState().then((r) => {
      if (!r.ok) setHydrateError(r.errors?.join(" · ") ?? t("admin_rec_load_failed"));
      setHydrated(true);
    });
  }, [t]);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_rec_auto_page_title"
          descriptionKey="admin_rec_auto_page_desc"
        />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_auto_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_rec_auto_page_title"
        descriptionKey="admin_rec_auto_page_desc_db"
      />
      {hydrateError ? (
        <div
          className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          {t("admin_rec_auto_hydrate_fail")} ({hydrateError})
        </div>
      ) : null}
      <div className="mb-4">
        <AutomationSummaryCards />
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {AUTO_TABS.map((tab) => (
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
