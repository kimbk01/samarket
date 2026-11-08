"use client";


import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { ActiveFeedVersionTable } from "./ActiveFeedVersionTable";
import { DeploymentPreparationPanel } from "./DeploymentPreparationPanel";
import { DeploymentHistoryTable } from "./DeploymentHistoryTable";
import { RollbackPolicyForm } from "./RollbackPolicyForm";
import { ExperimentWinnerTable } from "./ExperimentWinnerTable";
import { DeploymentLogList } from "./DeploymentLogList";
import { loadRecommendationExperimentsWithRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-client";

type TabId =
  | "active"
  | "prepare"
  | "history"
  | "rollback"
  | "winners"
  | "logs";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "active", labelKey: "admin_rec_deploy_tab_active" },
  { id: "prepare", labelKey: "admin_rec_deploy_tab_prepare" },
  { id: "history", labelKey: "admin_rec_deploy_tab_history" },
  { id: "rollback", labelKey: "admin_rec_deploy_tab_rollback" },
  { id: "winners", labelKey: "admin_rec_deploy_tab_winners" },
  { id: "logs", labelKey: "admin_rec_deploy_tab_logs" },
];

export function AdminRecommendationDeploymentPage() {
  const { t } = useI18n();
  /** 탭은 주소 `?tab=` 보존 — 목록 필터와 함께 새로고침·링크 공유 시 유지 (R7). */
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const raw = searchParams?.get("tab") ?? "";
    return TABS.some((tab) => tab.id === raw) ? (raw as TabId) : "active";
  });
  const { state: loadState, reload } = useAdminSyncLoad(loadRecommendationExperimentsWithRecordsSummary);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_rec_deployments" description={t("admin_rec_deploy_page_description")} />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_rec_deployments"
        description={t("admin_rec_deploy_page_description")}
      />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel={t("admin_rec_deploy_tabs_aria")}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        defaultValue="active"
        resetParams={["page", "surface", "deployment"]}
        className="mb-4"
      />
      <AdminCard>
        {activeTab === "active" && <ActiveFeedVersionTable />}
        {activeTab === "prepare" && <DeploymentPreparationPanel />}
        {activeTab === "history" && <DeploymentHistoryTable />}
        {activeTab === "rollback" && <RollbackPolicyForm />}
        {activeTab === "winners" && <ExperimentWinnerTable />}
        {activeTab === "logs" && <DeploymentLogList />}
      </AdminCard>
    </>
  );
}
