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
        <label className="text-[14px] font-medium text-gray-700">실험</label>
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
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
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          배정 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  사용자
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  실험
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  배정 그룹
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  버전
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  지역/회원
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
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
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {a.userId}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {exp?.experimentName ?? a.experimentId}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {ASSIGNED_GROUP_LABELS[a.assignedGroup]}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {version?.versionName ?? a.assignedVersionId}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-600">
                      {a.region} / {a.memberType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
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
