"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { loadOpsLearningFromServer } from "@/lib/ops-learning/ops-learning-sync-client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "history" | "patterns" | "quality" | "suggestions" | "patternLogs";

const LEARNING_STATUSES = ["detected", "reviewing", "action_created", "mitigated", "closed"] as const satisfies readonly OpsLearningStatus[];
type LearningFilterStatus = (typeof LEARNING_STATUSES)[number];
const LEARNING_STATUS_LABEL_KEYS: Record<LearningFilterStatus, MessageKey> = {
  detected: "admin_ops_tools_pattern_detected",
  reviewing: "admin_ops_tools_pattern_reviewing",
  action_created: "admin_ops_tools_pattern_action_created",
  mitigated: "admin_ops_tools_resolution_mitigated",
  closed: "admin_ops_tools_pattern_closed",
};

export function AdminOpsLearningPage() {
  const { t, language } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["history", "patterns", "quality", "suggestions", "patternLogs"] as const, "history");
  /** 상태 필터는 주소(`?status=`)에 보존 (R7) — 탭을 바꾸면 초기화. */
  const lq = useAdminListQuery({ statuses: LEARNING_STATUSES });
  const ko = language !== "en";
  const historyStatusFilter = lq.query.status as OpsLearningStatus | "";
  const patternStatusFilter = lq.query.status as OpsLearningStatus | "";
  const statusBar = (codes: readonly LearningFilterStatus[]) => (
    <AdminFilterBar
      ko={ko}
      className="mb-3"
      draft={lq.draft}
      onDraftChange={lq.setDraft}
      onSubmit={lq.submit}
      onReset={lq.reset}
      showPeriod={false}
      showSearch={false}
      status={{
        value: lq.query.status,
        onChange: lq.setStatus,
        options: codes.map((c) => ({ value: c, label: t(LEARNING_STATUS_LABEL_KEYS[c]) })),
      }}
    />
  );
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsLearningFromServer);
  const hydrated = loadState.status === "ready";

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
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_learning" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="history"
        resetParams={adminSyncTabResetParams([])}
        className="mb-4"
      />

      {activeTab === "history" && (
        <div className="space-y-4">
          <OpsLearningSummaryCards />
          <AdminCard titleKey="admin_ops_tools_learning_tab_history">
            {statusBar(LEARNING_STATUSES)}
            <OpsLearningHistoryTable statusFilter={historyStatusFilter} />
          </AdminCard>
        </div>
      )}

      {activeTab === "patterns" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
          <div className="space-y-4">
            <OpsLearningSummaryCards />
            <AdminCard titleKey="admin_ops_tools_learning_card_patterns">
              {statusBar(["detected", "reviewing", "mitigated"])}
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
