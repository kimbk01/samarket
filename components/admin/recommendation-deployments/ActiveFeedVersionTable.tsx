"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo, useState } from "react";
import { getActiveFeedVersions } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { rollbackSurface } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

export function ActiveFeedVersionTable() {
  const [refresh, setRefresh] = useState(0);
  const active = useMemo(() => getActiveFeedVersions(), [refresh]);

  if (active.length === 0) {
    return (
      <AdminEmptyState ko message={"운영 버전이 없습니다."} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
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
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {formatAdminManilaDateTime(a.updatedAt)}
                </td>
                <td className="px-3 py-2.5">
                  {canRollback ? (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={async () => {
                        const confirmed = await confirmAdminAction({
                          level: "L1",
                          ko: true,
                          title: "이전 버전으로 롤백",
                          description: `${SURFACE_LABELS[a.surface as RecommendationSurface] ?? a.surface} 피드를 이전 버전으로 되돌립니다.`,
                          confirmLabel: "롤백",
                        });
                        if (!confirmed.ok) return;
                        rollbackSurface(a.surface as RecommendationSurface);
                        setRefresh((r) => r + 1);
                      }}
                    >
                      이전 버전으로 롤백
                    </AdminActionButton>
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
