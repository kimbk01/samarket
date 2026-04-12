"use client";

import { useMemo, useState } from "react";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/mock-experiment-metrics";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";

export function ExperimentComparisonTable() {
  const [experimentId, setExperimentId] = useState<string>("");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const metrics = useMemo(
    () => (experimentId ? getExperimentMetrics(experimentId) : []),
    [experimentId]
  );

  const currentExp = experimentId
    ? experiments.find((e) => e.id === experimentId)
    : experiments[0];
  const effectiveId = currentExp?.id ?? "";
  const effectiveMetrics = effectiveId ? getExperimentMetrics(effectiveId) : [];

  if (experiments.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        실험이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-sam-fg">실험</label>
        <select
          value={experimentId || effectiveId}
          onChange={(e) => setExperimentId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.experimentName}
            </option>
          ))}
        </select>
      </div>
      {effectiveMetrics.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          해당 실험의 성과 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  버전
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  배정
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  노출
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  클릭
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  전환
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  CTR
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  전환률
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  평균점수
                </th>
              </tr>
            </thead>
            <tbody>
              {effectiveMetrics.map((m) => {
                const version = getFeedVersionById(m.versionId);
                return (
                  <tr
                    key={m.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="px-3 py-2.5 font-medium text-sam-fg">
                      {version?.versionName ?? m.versionId}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.assignedUsers}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.impressionCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.clickCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.conversionCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {(m.ctr * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {(m.conversionRate * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.avgScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
