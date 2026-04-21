"use client";

import { useMemo, useState } from "react";
import type { ExperimentLog } from "@/lib/types/recommendation-experiment";
import { getExperimentLogs } from "@/lib/recommendation-experiments/mock-experiment-logs";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";

const ACTION_LABELS: Record<ExperimentLog["actionType"], string> = {
  create: "생성",
  update: "수정",
  start: "시작",
  pause: "일시중지",
  end: "종료",
  assign_user: "사용자 배정",
  choose_winner: "승자 선택",
};

interface ExperimentLogListProps {
  experimentId?: string;
}

export function ExperimentLogList({ experimentId }: ExperimentLogListProps) {
  const [filterExp, setFilterExp] = useState(experimentId ?? "");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const logs = useMemo(
    () => getExperimentLogs(filterExp || undefined),
    [filterExp]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">실험</label>
        <select
          value={filterExp}
          onChange={(e) => setFilterExp(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">전체</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.experimentName}
            </option>
          ))}
        </select>
      </div>
      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          로그가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  실험
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  액션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  담당
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const exp = experiments.find((e) => e.id === l.experimentId);
                return (
                  <tr
                    key={l.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {new Date(l.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {exp?.experimentName ?? l.experimentId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {ACTION_LABELS[l.actionType]}
                    </td>
                    <td className="px-3 py-2.5 text-sam-muted">
                      {l.actorNickname} ({l.actorType})
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {l.note}
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
