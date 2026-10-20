"use client";


import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import type { MessageKey } from "@/lib/i18n/messages";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { ActiveFeedVersionTable } from "./ActiveFeedVersionTable";
import { DeploymentPreparationPanel } from "./DeploymentPreparationPanel";
import { DeploymentHistoryTable } from "./DeploymentHistoryTable";
import { RollbackPolicyForm } from "./RollbackPolicyForm";
import { ExperimentWinnerTable } from "./ExperimentWinnerTable";
import { DeploymentLogList } from "./DeploymentLogList";
import { loadRecommendationExperimentsFromServer } from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";

type TabId =
  | "active"
  | "prepare"
  | "history"
  | "rollback"
  | "winners"
  | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "active", label: "운영 버전" },
  { id: "prepare", label: "배포 준비" },
  { id: "history", label: "배포 이력" },
  { id: "rollback", label: "롤백 정책" },
  { id: "winners", label: "실험 승자" },
  { id: "logs", label: "배포 로그" },
];

export function AdminRecommendationDeploymentPage() {
  const [activeTab, setActiveTab] = useState<TabId>("active");
  const { state: loadState, reload } = useAdminSyncLoad(loadRecommendationExperimentsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_rec_deployments" description="운영 버전·배포·롤백·실험 승자 관리" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_rec_deployments"
        description="운영 버전·배포·롤백·실험 승자 관리"
      />
      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="추천 배포 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
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
