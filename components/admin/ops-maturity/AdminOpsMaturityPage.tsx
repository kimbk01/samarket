"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsMaturityScoreCards } from "./OpsMaturityScoreCards";
import { OpsTeamKpiTable } from "./OpsTeamKpiTable";
import { OpsRoadmapBoard } from "./OpsRoadmapBoard";
import { OpsMaturityHistoryChart } from "./OpsMaturityHistoryChart";
import { OpsImprovementSummaryCards } from "./OpsImprovementSummaryCards";

type TabId = "scores" | "kpi" | "roadmap" | "history" | "summary";

export function AdminOpsMaturityPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("scores");

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "scores", labelKey: "admin_ops_tools_maturity_tab_scores" },
    { id: "kpi", labelKey: "admin_ops_tools_maturity_tab_kpi" },
    { id: "roadmap", labelKey: "admin_ops_tools_maturity_tab_roadmap" },
    { id: "history", labelKey: "admin_ops_tools_maturity_tab_history" },
    { id: "summary", labelKey: "admin_ops_tools_maturity_tab_summary" },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_tools_maturity_page_title" />
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
