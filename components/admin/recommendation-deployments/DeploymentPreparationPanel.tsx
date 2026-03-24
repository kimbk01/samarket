"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedVersions } from "@/lib/recommendation-experiments/mock-feed-versions";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { getExperimentWinnerSummaries } from "@/lib/recommendation-deployments/mock-experiment-winner-summaries";
import { deployVersion } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function DeploymentPreparationPanel() {
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [versionId, setVersionId] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const versions = useMemo(
    () => getFeedVersions(surface),
    [surface, refresh]
  );
  const active = useMemo(
    () => getActiveFeedVersionBySurface(surface),
    [surface, refresh]
  );
  const winnerSummaries = useMemo(
    () => getExperimentWinnerSummaries().filter((s) => {
      const v = versions.find((x) => x.id === s.winningVersionId);
      return v?.surface === surface;
    }),
    [surface, versions]
  );

  const handleDeploy = () => {
    if (!versionId) return;
    setDeploying(true);
    deployVersion({
      surface,
      versionId,
      deploymentName: `배포: ${versions.find((v) => v.id === versionId)?.versionName ?? versionId}`,
      note: "관리자 배포",
    });
    setDeploying(false);
    setVersionId("");
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-[14px] font-medium text-gray-900">배포 시뮬레이션</p>
        <p className="mt-1 text-[13px] text-gray-600">
          선택한 버전이 해당 surface의 live 버전으로 설정됩니다. 현재 live:{" "}
          {active?.liveVersionId ?? "-"}
        </p>
      </div>
      {winnerSummaries.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-[14px] font-medium text-amber-900">
            실험 승자 추천 (자동 배포 추천)
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-amber-800">
            {winnerSummaries.slice(0, 3).map((s) => (
              <li key={s.experimentId}>
                실험 {s.experimentId} → 버전 {s.winningVersionId} (
                {s.winningMetric}) {s.autoDeployRecommended ? "· 배포 추천" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">surface</label>
        <select
          value={surface}
          onChange={(e) => {
            setSurface(e.target.value as RecommendationSurface);
            setVersionId("");
          }}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="text-[14px] font-medium text-gray-700">버전</label>
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">선택</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleDeploy}
          disabled={!versionId || deploying}
          className="rounded border border-signature bg-signature px-3 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        >
          배포 실행
        </button>
      </div>
      <p className="text-[12px] text-gray-500">
        배포 예약은 placeholder입니다. 실행 시 즉시 live 반영됩니다.
      </p>
    </div>
  );
}
