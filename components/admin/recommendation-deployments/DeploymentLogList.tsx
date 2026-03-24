"use client";

import { useMemo, useState } from "react";
import { getRecommendationDeploymentLogs } from "@/lib/recommendation-deployments/mock-recommendation-deployment-logs";
import { getRecommendationDeployments } from "@/lib/recommendation-deployments/mock-recommendation-deployments";

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  schedule: "예약",
  deploy: "배포",
  rollback: "롤백",
  archive: "아카이브",
  choose_winner: "승자 선택",
};

export function DeploymentLogList() {
  const [deploymentId, setDeploymentId] = useState("");

  const deployments = useMemo(() => getRecommendationDeployments(), []);
  const logs = useMemo(
    () => getRecommendationDeploymentLogs(deploymentId || undefined),
    [deploymentId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">배포</label>
        <select
          value={deploymentId}
          onChange={(e) => setDeploymentId(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체</option>
          {deployments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deploymentName}
            </option>
          ))}
        </select>
      </div>
      {logs.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          로그가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  배포 ID
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  액션
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  담당
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                    {new Date(l.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{l.deploymentId}</td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {ACTION_LABELS[l.actionType] ?? l.actionType}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {l.actorNickname} ({l.actorType})
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                    {l.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
