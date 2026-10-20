"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useState } from "react";
import { loadOpsLearningFromServer } from "@/lib/ops-learning/ops-learning-sync-client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { OpsLearningSummaryCards } from "./OpsLearningSummaryCards";
import { OpsLearningHistoryTable } from "./OpsLearningHistoryTable";
import { OpsIssuePatternTable } from "./OpsIssuePatternTable";
import { OpsPatternDetailPanel } from "./OpsPatternDetailPanel";
import { OpsPatternLogList } from "./OpsPatternLogList";
import { OpsResponseQualityTable } from "./OpsResponseQualityTable";
import { OpsImprovementSuggestionTable } from "./OpsImprovementSuggestionTable";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import type { MessageKey } from "@/lib/i18n/messages";

type TabId = "history" | "patterns" | "quality" | "suggestions" | "patternLogs";

export function AdminOpsLearningPage() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("history");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<OpsLearningStatus | "">("");
  const [patternStatusFilter, setPatternStatusFilter] = useState<OpsLearningStatus | "">("");
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsLearningFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "history", labelKey: "admin_ops_tools_learning_tab_history" },
    { id: "patterns", labelKey: "admin_ops_tools_learning_tab_patterns" },
    { id: "quality", labelKey: "admin_ops_tools_learning_tab_quality" },
    { id: "suggestions", labelKey: "admin_ops_tools_learning_tab_suggestions" },
    { id: "patternLogs", labelKey: "admin_ops_tools_learning_tab_logs" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_learning" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_learning" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />

      {activeTab === "history" && (
        <div className="space-y-4">
          <OpsLearningSummaryCards />
          <AdminCard titleKey="admin_ops_tools_learning_tab_history">
            <div className="mb-3">
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as OpsLearningStatus | "")}
                className="rounded border border-sam-border px-3 py-2 sam-text-body"
              >
                <option value="">{t("admin_ops_tools_board_filter_status")}</option>
                <option value="detected">{t("admin_ops_tools_pattern_detected")}</option>
                <option value="reviewing">{t("admin_ops_tools_pattern_reviewing")}</option>
                <option value="action_created">{t("admin_ops_tools_pattern_action_created")}</option>
                <option value="mitigated">{t("admin_ops_tools_resolution_mitigated")}</option>
                <option value="closed">{t("admin_ops_tools_pattern_closed")}</option>
              </select>
            </div>
            <OpsLearningHistoryTable statusFilter={historyStatusFilter} />
          </AdminCard>
        </div>
      )}

      {activeTab === "patterns" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
          <div className="space-y-4">
            <OpsLearningSummaryCards />
            <AdminCard titleKey="admin_ops_tools_learning_card_patterns">
              <div className="mb-3">
                <select
                  value={patternStatusFilter}
                  onChange={(e) => setPatternStatusFilter(e.target.value as OpsLearningStatus | "")}
                  className="rounded border border-sam-border px-3 py-2 sam-text-body"
                >
                  <option value="">{t("admin_ops_tools_board_filter_status")}</option>
                  <option value="detected">{t("admin_ops_tools_pattern_detected")}</option>
                  <option value="reviewing">{t("admin_ops_tools_pattern_reviewing")}</option>
                  <option value="mitigated">{t("admin_ops_tools_resolution_mitigated")}</option>
                </select>
              </div>
              <OpsIssuePatternTable
                statusFilter={patternStatusFilter}
                onSelectPattern={setSelectedPatternId}
              />
            </AdminCard>
          </div>
          <AdminCard titleKey="admin_ops_tools_learning_card_detail">
            <OpsPatternDetailPanel
              patternId={selectedPatternId}
              onClose={() => setSelectedPatternId(null)}
            />
          </AdminCard>
        </div>
      )}

      {activeTab === "quality" && (
        <div className="space-y-4">
          <OpsLearningSummaryCards />
          <AdminCard titleKey="admin_ops_tools_learning_card_quality">
            <OpsResponseQualityTable />
          </AdminCard>
        </div>
      )}

      {activeTab === "suggestions" && (
        <AdminCard titleKey="admin_ops_tools_learning_tab_suggestions">
          <OpsImprovementSuggestionTable />
        </AdminCard>
      )}

      {activeTab === "patternLogs" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
          <AdminCard titleKey="admin_ops_tools_learning_card_pattern_pick">
            <OpsIssuePatternTable onSelectPattern={setSelectedPatternId} />
          </AdminCard>
          <AdminCard titleKey="admin_ops_tools_learning_card_pattern_logs">
            {selectedPatternId ? (
              <OpsPatternLogList patternId={selectedPatternId} />
            ) : (
              <p className="sam-text-body text-sam-muted">{t("admin_ops_tools_learning_log_pick")}</p>
            )}
          </AdminCard>
        </div>
      )}
    </>
  );
}
