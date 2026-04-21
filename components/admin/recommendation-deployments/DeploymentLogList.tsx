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
        <label className="sam-text-body font-medium text-sam-fg">배포</label>
        <select
          value={deploymentId}
          onChange={(e) => setDeploymentId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
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
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          로그가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[480px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  배포 ID
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
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(l.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{l.deploymentId}</td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {ACTION_LABELS[l.actionType] ?? l.actionType}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {l.actorNickname} ({l.actorType})
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
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
