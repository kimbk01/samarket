"use client";

import { useEffect, useMemo, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  getRecommendationExperiments,
  saveRecommendationExperiment,
  setExperimentStatus,
} from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { addExperimentLog } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersions, saveFeedVersion } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import type { FeedVersion } from "@/lib/types/recommendation-experiment";
import { ExperimentTable } from "./ExperimentTable";
import { ExperimentForm } from "./ExperimentForm";
import { FeedVersionTable } from "./FeedVersionTable";
import { FeedVersionForm } from "./FeedVersionForm";
import { UserAssignmentTable } from "./UserAssignmentTable";
import { ExperimentMetricsCards } from "./ExperimentMetricsCards";
import { ExperimentComparisonTable } from "./ExperimentComparisonTable";
import { ExperimentLogList } from "./ExperimentLogList";
import {
  loadRecommendationExperimentsFromServer,
  persistRecommendationExperimentsToServer,
} from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";

type TabId = "experiments" | "versions" | "assignments" | "metrics" | "logs";

const EXP_TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "experiments", labelKey: "admin_rec_exp_tab_experiments" },
  { id: "versions", labelKey: "admin_rec_exp_tab_versions" },
  { id: "assignments", labelKey: "admin_rec_exp_tab_assignments" },
  { id: "metrics", labelKey: "admin_rec_exp_tab_metrics" },
  { id: "logs", labelKey: "admin_rec_exp_tab_logs" },
];

export function AdminRecommendationExperimentPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("experiments");
  const [refresh, setRefresh] = useState(0);
  const [editingExperimentId, setEditingExperimentId] = useState<string | null>(
    null
  );
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadRecommendationExperimentsFromServer().then(() => setHydrated(true));
  }, []);

  const persist = () => {
    void persistRecommendationExperimentsToServer();
  };

  const experiments = useMemo(
    () => getRecommendationExperiments(),
    [refresh]
  );
  const versions = useMemo(() => getFeedVersions(), [refresh]);
  const editingExperiment = useMemo(
    () =>
      editingExperimentId
        ? experiments.find((e) => e.id === editingExperimentId)
        : null,
    [editingExperimentId, experiments]
  );
  const editingVersion = useMemo(
    () =>
      editingVersionId
        ? versions.find((v) => v.id === editingVersionId)
        : null,
    [editingVersionId, versions]
  );

  const handleSaveExperiment = (values: Partial<RecommendationExperiment>) => {
    if (!editingExperiment) return;
    saveRecommendationExperiment({ ...editingExperiment, ...values });
    addExperimentLog(
      editingExperiment.id,
      "update",
      "admin_rec_log_note_policy_update"
    );
    setRefresh((r) => r + 1);
    setEditingExperimentId(null);
    persist();
  };

  const handleExperimentStatus = (
    exp: RecommendationExperiment,
    status: RecommendationExperiment["status"]
  ) => {
    setExperimentStatus(exp.id, status);
    const noteKey: MessageKey =
      status === "running"
        ? "admin_rec_log_note_experiment_start"
        : status === "paused"
          ? "admin_rec_log_note_experiment_pause"
          : "admin_rec_log_note_experiment_end";
    addExperimentLog(
      exp.id,
      status === "running" ? "start" : status === "paused" ? "pause" : "end",
      noteKey
    );
    setRefresh((r) => r + 1);
    persist();
  };

  const handleChooseWinner = (exp: RecommendationExperiment) => {
    addExperimentLog(exp.id, "choose_winner", "admin_rec_log_note_choose_winner");
    setRefresh((r) => r + 1);
    persist();
  };

  const handleSaveVersion = (values: Partial<FeedVersion>) => {
    if (!editingVersion) return;
    saveFeedVersion({ ...editingVersion, ...values });
    setRefresh((r) => r + 1);
    setEditingVersionId(null);
    persist();
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_rec_exp_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_rec_exp_page_title" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {EXP_TABS.map((tab) => (
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

      {activeTab === "experiments" && (
        <AdminCard titleKey="admin_rec_exp_card_ab">
          {editingExperiment && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <ExperimentForm
                initial={editingExperiment}
                onSubmit={handleSaveExperiment}
                onCancel={() => setEditingExperimentId(null)}
              />
            </div>
          )}
          <ExperimentTable
            experiments={experiments}
            onEdit={(e) =>
              setEditingExperimentId(
                editingExperimentId === e.id ? null : e.id
              )
            }
            onStatusChange={handleExperimentStatus}
            onChooseWinner={handleChooseWinner}
          />
        </AdminCard>
      )}

      {activeTab === "versions" && (
        <AdminCard titleKey="admin_rec_exp_card_versions">
          {editingVersion && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <FeedVersionForm
                initial={editingVersion}
                onSubmit={handleSaveVersion}
                onCancel={() => setEditingVersionId(null)}
              />
            </div>
          )}
          <FeedVersionTable
            versions={versions}
            onEdit={(v) =>
              setEditingVersionId(editingVersionId === v.id ? null : v.id)
            }
          />
        </AdminCard>
      )}

      {activeTab === "assignments" && (
        <AdminCard titleKey="admin_rec_exp_card_assignments">
          <UserAssignmentTable />
        </AdminCard>
      )}

      {activeTab === "metrics" && (
        <>
          <AdminCard titleKey="admin_rec_exp_card_metrics_cards">
            <ExperimentMetricsCards />
          </AdminCard>
          <AdminCard titleKey="admin_rec_exp_card_metrics_table">
            <ExperimentComparisonTable />
          </AdminCard>
        </>
      )}

      {activeTab === "logs" && (
        <AdminCard titleKey="admin_rec_exp_card_logs">
          <ExperimentLogList />
        </AdminCard>
      )}
    </div>
  );
}
