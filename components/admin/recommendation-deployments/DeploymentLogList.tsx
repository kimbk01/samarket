"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { RecommendationFilterSelect } from "@/components/admin/recommendation-admin-filter-select";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getRecommendationDeploymentLogs } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getRecommendationDeployments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  schedule: "예약",
  deploy: "배포",
  rollback: "롤백",
  archive: "아카이브",
  choose_winner: "승자 선택",
};

export function DeploymentLogList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 배포 필터 — 주소 `?deployment=` 보존 (R7) */
  const lq = useAdminListQuery<"deployment">({ extras: ["deployment"] });
  const deploymentId = lq.query.extras.deployment;

  const deployments = useMemo(() => getRecommendationDeployments(), []);
  const logs = useMemo(
    () => getRecommendationDeploymentLogs(deploymentId || undefined),
    [deploymentId]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <RecommendationFilterSelect
          label={t("admin_rec_deploy_deploy_5")}
          value={deploymentId}
          allLabel={t("common_all")}
          options={deployments.map((d) => ({ value: d.id, label: d.deploymentName }))}
          onChange={(v) => lq.setExtra("deployment", v)}
          name="deployment"
        />
      </AdminFilterBar>
      {logs.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={deploymentId ? undefined : "로그가 없습니다."}
          onReset={deploymentId ? lq.reset : undefined}
        />
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
                    {formatAdminManilaDateTime(l.createdAt)}
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
