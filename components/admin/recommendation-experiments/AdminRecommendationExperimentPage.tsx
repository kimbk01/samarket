"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
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
  commitRecommendationExperimentsChange,
  loadRecommendationExperimentsFromServer,
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
  const { t, language } = useI18n();
  /** 탭은 주소 `?tab=` 보존 — 필터(`?experiment=`)와 함께 새로고침·링크 공유 시 유지 (R7). */
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const raw = searchParams?.get("tab") ?? "";
    return EXP_TABS.some((tab) => tab.id === raw) ? (raw as TabId) : "experiments";
  });
  const [refresh, setRefresh] = useState(0);
  const [editingExperimentId, setEditingExperimentId] = useState<string | null>(
    null
  );
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const { state: loadState, reload } = useAdminSyncLoad(loadRecommendationExperimentsFromServer);
  const hydrated = loadState.status === "ready";

  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  /** 서버 저장 중 — 행 동작 비활성 (중복 전이 방지) */
  const [saving, setSaving] = useState(false);

  /** 변경 → 서버 저장. 실패면 commit 이 화면 상태를 되돌리고 실패 문구를 표시한다 (예전: 실패 무시). */
  const commit = (mutate: () => void) => {
    setSaving(true);
    void commitRecommendationExperimentsChange(mutate)
      .then((r) => {
        setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
        setRefresh((n) => n + 1);
      })
      .finally(() => setSaving(false));
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
    commit(() => {
      saveRecommendationExperiment({ ...editingExperiment, ...values });
      addExperimentLog(
        editingExperiment.id,
        "update",
        "admin_rec_log_note_policy_update"
      );
    });
    setRefresh((r) => r + 1);
    setEditingExperimentId(null);
  };

  const handleExperimentStatus = (
    exp: RecommendationExperiment,
    status: RecommendationExperiment["status"]
  ) => {
    const noteKey: MessageKey =
      status === "running"
        ? "admin_rec_log_note_experiment_start"
        : status === "paused"
          ? "admin_rec_log_note_experiment_pause"
          : "admin_rec_log_note_experiment_end";
    commit(() => {
      setExperimentStatus(exp.id, status);
      addExperimentLog(
        exp.id,
        status === "running" ? "start" : status === "paused" ? "pause" : "end",
        noteKey
      );
    });
    setRefresh((r) => r + 1);
  };

  const handleChooseWinner = (exp: RecommendationExperiment) => {
    commit(() => addExperimentLog(exp.id, "choose_winner", "admin_rec_log_note_choose_winner"));
    setRefresh((r) => r + 1);
  };

  const handleSaveVersion = (values: Partial<FeedVersion>) => {
    if (!editingVersion) return;
    commit(() => saveFeedVersion({ ...editingVersion, ...values }));
    setRefresh((r) => r + 1);
    setEditingVersionId(null);
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_menu_manage_ab" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_manage_ab" />
      <AdminResultBanner ko={language !== "en"} result={saveResult} onClose={() => setSaveResult(null)} />

      <AdminTabs
        tabs={EXP_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="추천 실험 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        defaultValue="experiments"
        resetParams={["page", "experiment"]}
      />

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
            editingId={editingExperimentId}
            busy={saving}
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
