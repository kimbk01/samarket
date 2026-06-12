"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("active");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadRecommendationExperimentsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_rec_deploy_deploy_13" description="운영 버전·배포·롤백·실험 승자 관리" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_rec_deploy_deploy_13"
        description="운영 버전·배포·롤백·실험 승자 관리"
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
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
            {tab.label}
          </button>
        ))}
      </div>
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
