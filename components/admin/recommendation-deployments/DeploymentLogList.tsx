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

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  create: "admin_rec_deploy_log_action_create",
  schedule: "admin_rec_deploy_log_action_schedule",
  deploy: "admin_rec_deploy_log_action_deploy",
  rollback: "admin_rec_deploy_log_action_rollback",
  archive: "admin_rec_deploy_log_action_archive",
  choose_winner: "admin_rec_deploy_log_action_choose_winner",
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
          message={deploymentId ? undefined : t("admin_rec_deploy_no_logs")}
          onReset={deploymentId ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[480px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_deployments_col_time")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_deployments_col_deployment_id")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_deployments_col_action")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_deployments_col_owner")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_deployments_col_note")}
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
                    {ACTION_LABEL_KEYS[l.actionType] ? t(ACTION_LABEL_KEYS[l.actionType]) : l.actionType}
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
