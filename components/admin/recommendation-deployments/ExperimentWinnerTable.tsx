"use client";

import { useMemo, useState } from "react";
import type { WinningMetric } from "@/lib/types/recommendation-deployment";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getExperimentWinnerSummaries } from "@/lib/recommendation-deployments/mock-experiment-winner-summaries";
import { chooseWinner } from "@/lib/recommendation-deployments/mock-experiment-winner-summaries";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { ASSIGNED_GROUP_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const WINNING_METRIC_LABELS: Record<WinningMetric, string> = {
  ctr: "CTR 우선",
  conversion_rate: "전환율 우선",
  composite_score: "복합 점수 우선",
};

export function ExperimentWinnerTable() {
  const [metric, setMetric] = useState<WinningMetric>("ctr");
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const experiments = useMemo(
    () => getRecommendationExperiments().filter((e) => e.status === "ended"),
    [refresh]
  );
  const summaries = useMemo(
    () => getExperimentWinnerSummaries(),
    [refresh]
  );

  const handleChooseWinner = (experimentId: string) => {
    setChoosingId(experimentId);
    chooseWinner(experimentId, metric);
    setChoosingId(null);
    setRefresh((r) => r + 1);
  };

  if (experiments.length === 0 && summaries.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        종료된 실험이나 승자 요약이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">
          승자 선택 기준
        </label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as WinningMetric)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {(Object.keys(WINNING_METRIC_LABELS) as WinningMetric[]).map((m) => (
            <option key={m} value={m}>
              {WINNING_METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                실험
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                승자 버전
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                그룹
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                기준 / 값
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                배포 추천
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => {
              const exp = experiments.find((e) => e.id === s.experimentId);
              const version = getFeedVersionById(s.winningVersionId);
              return (
                <tr
                  key={s.experimentId}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {exp?.experimentName ?? s.experimentId}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {version?.versionName ?? s.winningVersionId}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {ASSIGNED_GROUP_LABELS[s.winningGroup]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {WINNING_METRIC_LABELS[s.winningMetric]} / {s.winningValue}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.autoDeployRecommended ? (
                      <span className="text-[13px] text-emerald-600">추천</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2.5">-</td>
                </tr>
              );
            })}
            {experiments
              .filter((e) => !summaries.some((s) => s.experimentId === e.id))
              .map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {e.experimentName}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500">-</td>
                  <td className="px-3 py-2.5 text-gray-500">-</td>
                  <td className="px-3 py-2.5 text-gray-500">-</td>
                  <td className="px-3 py-2.5 text-gray-500">-</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleChooseWinner(e.id)}
                      disabled={!!choosingId}
                      className="text-[13px] text-signature hover:underline disabled:opacity-50"
                    >
                      승자 선택
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
