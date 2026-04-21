"use client";

import { useMemo, useState } from "react";
import type { ExperimentMetrics } from "@/lib/types/recommendation-experiment";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/mock-experiment-metrics";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";

export function ExperimentMetricsCards() {
  const [experimentId, setExperimentId] = useState<string>("");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const effectiveId = experimentId || experiments[0]?.id || "";
  const effectiveMetrics = useMemo(
    () => (effectiveId ? getExperimentMetrics(effectiveId) : []),
    [effectiveId]
  );

  if (experiments.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        실험이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">실험</label>
        <select
          value={effectiveId}
          onChange={(e) => setExperimentId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.experimentName}
            </option>
          ))}
        </select>
      </div>
      {effectiveMetrics.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          해당 실험의 성과 데이터가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveMetrics.map((m) => {
            const version = getFeedVersionById(m.versionId);
            return (
              <div
                key={m.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              >
                <p className="sam-text-body font-medium text-sam-fg">
                  {version?.versionName ?? m.versionId}
                </p>
                <dl className="mt-2 space-y-1 sam-text-body-secondary text-sam-fg">
                  <div className="flex justify-between">
                    <dt>배정 사용자</dt>
                    <dd>{m.assignedUsers}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>노출</dt>
                    <dd>{m.impressionCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>클릭</dt>
                    <dd>{m.clickCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>전환</dt>
                    <dd>{m.conversionCount}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>CTR</dt>
                    <dd>{(m.ctr * 100).toFixed(2)}%</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>전환률</dt>
                    <dd>{(m.conversionRate * 100).toFixed(2)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>평균 점수</dt>
                    <dd>{m.avgScore}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
