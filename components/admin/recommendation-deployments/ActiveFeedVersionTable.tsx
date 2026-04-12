"use client";

import { useMemo, useState } from "react";
import { getActiveFeedVersions } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { rollbackSurface } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

export function ActiveFeedVersionTable() {
  const [refresh, setRefresh] = useState(0);
  const active = useMemo(() => getActiveFeedVersions(), [refresh]);

  if (active.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        운영 버전이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              현재 live 버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              이전 버전
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              롤아웃 %
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              갱신
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              롤백
            </th>
          </tr>
        </thead>
        <tbody>
          {active.map((a) => {
            const version = getFeedVersionById(a.liveVersionId);
            const prevVersion = a.previousVersionId
              ? getFeedVersionById(a.previousVersionId)
              : null;
            const canRollback = !!a.previousVersionId;
            return (
              <tr
                key={a.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {SURFACE_LABELS[a.surface]}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {version?.versionName ?? a.liveVersionId}
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {prevVersion?.versionName ?? a.previousVersionId ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{a.rolloutPercent}%</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                  {new Date(a.updatedAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2.5">
                  {canRollback ? (
                    <button
                      type="button"
                      onClick={() => {
                        rollbackSurface(a.surface as RecommendationSurface);
                        setRefresh((r) => r + 1);
                      }}
                      className="text-[13px] text-amber-600 hover:underline"
                    >
                      이전 버전으로 롤백
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
