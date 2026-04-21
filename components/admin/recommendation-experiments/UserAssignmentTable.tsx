"use client";

import { useMemo, useState } from "react";
import { getUserFeedAssignments } from "@/lib/recommendation-experiments/mock-user-feed-assignments";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { ASSIGNED_GROUP_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

export function UserAssignmentTable() {
  const [experimentId, setExperimentId] = useState<string>("");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const assignments = useMemo(
    () =>
      getUserFeedAssignments(
        experimentId ? { experimentId } : undefined
      ),
    [experimentId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">실험</label>
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
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
      {assignments.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          배정 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  사용자
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  실험
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  배정 그룹
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  버전
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  지역/회원
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  배정 시각
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const version = getFeedVersionById(a.assignedVersionId);
                const exp = experiments.find((e) => e.id === a.experimentId);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="px-3 py-2.5 font-medium text-sam-fg">
                      {a.userId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {exp?.experimentName ?? a.experimentId}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {ASSIGNED_GROUP_LABELS[a.assignedGroup]}
                    </td>
                    <td className="px-3 py-2.5 text-sam-fg">
                      {version?.versionName ?? a.assignedVersionId}
                    </td>
                    <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {a.region} / {a.memberType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {new Date(a.assignedAt).toLocaleString("ko-KR")}
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
