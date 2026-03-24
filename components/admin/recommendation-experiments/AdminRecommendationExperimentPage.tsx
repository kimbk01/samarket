"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  getRecommendationExperiments,
  saveRecommendationExperiment,
  setExperimentStatus,
} from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { addExperimentLog } from "@/lib/recommendation-experiments/mock-experiment-logs";
import { getFeedVersions, saveFeedVersion } from "@/lib/recommendation-experiments/mock-feed-versions";
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

type TabId = "experiments" | "versions" | "assignments" | "metrics" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "experiments", label: "실험 목록" },
  { id: "versions", label: "피드 버전" },
  { id: "assignments", label: "사용자 배정" },
  { id: "metrics", label: "성과 비교" },
  { id: "logs", label: "로그" },
];

export function AdminRecommendationExperimentPage() {
  const [activeTab, setActiveTab] = useState<TabId>("experiments");
  const [refresh, setRefresh] = useState(0);
  const [editingExperimentId, setEditingExperimentId] = useState<string | null>(
    null
  );
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

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
    addExperimentLog(editingExperiment.id, "update", "정책 수정");
    setRefresh((r) => r + 1);
    setEditingExperimentId(null);
  };

  const handleExperimentStatus = (
    exp: RecommendationExperiment,
    status: RecommendationExperiment["status"]
  ) => {
    setExperimentStatus(exp.id, status);
    addExperimentLog(
      exp.id,
      status === "running" ? "start" : status === "paused" ? "pause" : "end",
      status === "running" ? "실험 시작" : status === "paused" ? "일시중지" : "실험 종료"
    );
    setRefresh((r) => r + 1);
  };

  const handleChooseWinner = (exp: RecommendationExperiment) => {
    addExperimentLog(exp.id, "choose_winner", "승자 버전 선택 (placeholder)");
    setRefresh((r) => r + 1);
  };

  const handleSaveVersion = (values: Partial<FeedVersion>) => {
    if (!editingVersion) return;
    saveFeedVersion({ ...editingVersion, ...values });
    setRefresh((r) => r + 1);
    setEditingVersionId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="추천 A/B 실험" />

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === t.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "experiments" && (
        <AdminCard title="추천 실험 (A/B 테스트)">
          {editingExperiment && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
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
        <AdminCard title="피드 버전">
          {editingVersion && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
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
        <AdminCard title="사용자 배정">
          <UserAssignmentTable />
        </AdminCard>
      )}

      {activeTab === "metrics" && (
        <>
          <AdminCard title="버전별 성과 카드">
            <ExperimentMetricsCards />
          </AdminCard>
          <AdminCard title="버전 비교 표">
            <ExperimentComparisonTable />
          </AdminCard>
        </>
      )}

      {activeTab === "logs" && (
        <AdminCard title="실험 로그">
          <ExperimentLogList />
        </AdminCard>
      )}
    </div>
  );
}
