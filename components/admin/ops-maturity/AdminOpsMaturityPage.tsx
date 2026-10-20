"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { OpsMaturityScoreCards } from "./OpsMaturityScoreCards";
import { OpsTeamKpiTable } from "./OpsTeamKpiTable";
import { OpsRoadmapBoard } from "./OpsRoadmapBoard";
import { OpsMaturityHistoryChart } from "./OpsMaturityHistoryChart";
import { OpsImprovementSummaryCards } from "./OpsImprovementSummaryCards";
import { loadOpsMaturityFromServer } from "@/lib/ops-maturity/ops-maturity-sync-client";

type TabId = "scores" | "kpi" | "roadmap" | "history" | "summary";

export function AdminOpsMaturityPage() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("scores");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsMaturityFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "scores", labelKey: "admin_ops_tools_maturity_tab_scores" },
    { id: "kpi", labelKey: "admin_ops_tools_maturity_tab_kpi" },
    { id: "roadmap", labelKey: "admin_ops_tools_maturity_tab_roadmap" },
    { id: "history", labelKey: "admin_ops_tools_maturity_tab_history" },
    { id: "summary", labelKey: "admin_ops_tools_maturity_tab_summary" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_maturity" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_maturity" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />

      {activeTab === "scores" && (
        <AdminCard titleKey="admin_ops_tools_maturity_card_scores">
          <OpsMaturityScoreCards />
        </AdminCard>
      )}

      {activeTab === "kpi" && (
        <AdminCard titleKey="admin_ops_tools_maturity_card_kpi">
          <OpsTeamKpiTable />
        </AdminCard>
      )}

      {activeTab === "roadmap" && (
        <AdminCard titleKey="admin_ops_tools_maturity_card_roadmap">
          <OpsRoadmapBoard />
        </AdminCard>
      )}

      {activeTab === "history" && (
        <AdminCard titleKey="admin_ops_tools_maturity_card_history">
          <OpsMaturityHistoryChart />
        </AdminCard>
      )}

      {activeTab === "summary" && (
        <AdminCard titleKey="admin_ops_tools_maturity_card_summary">
          <OpsImprovementSummaryCards />
        </AdminCard>
      )}
    </>
  );
}
