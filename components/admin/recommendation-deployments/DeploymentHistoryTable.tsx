"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getRecommendationDeployments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { PLATFORM_REC_DEPLOYMENT_NS } from "@/lib/admin/status-labels/platform-status-labels";

export function DeploymentHistoryTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [surfaceFilter, setSurfaceFilter] = useState<string>("");

  const deployments = useMemo(
    () =>
      getRecommendationDeployments(
        surfaceFilter
          ? { surface: surfaceFilter as "home" | "search" | "shop" }
          : undefined
      ),
    [surfaceFilter]
  );

  if (deployments.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={surfaceFilter}
            onChange={(e) => setSurfaceFilter(e.target.value)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="">{t("admin_rec_deploy_all")}</option>
            <option value="home">{t("admin_surface_home")}</option>
            <option value="search">{t("admin_surface_search")}</option>
            <option value="shop">{t("admin_rec_deploy_shop")}</option>
          </select>
        </div>
        <AdminEmptyState
          ko={ko}
          message={surfaceFilter ? undefined : "배포 이력이 없습니다."}
          onReset={surfaceFilter ? () => { setSurfaceFilter(""); } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={surfaceFilter}
          onChange={(e) => setSurfaceFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_deploy_all")}</option>
          <option value="home">{t("admin_surface_home")}</option>
          <option value="search">{t("admin_surface_search")}</option>
          <option value="shop">{t("admin_rec_deploy_shop")}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[640px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                배포명
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                surface
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                배포 버전
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                상태
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                배포 시각
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                담당
              </th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((d) => {
              const version = getFeedVersionById(d.deployedVersionId);
              return (
                <tr
                  key={d.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {d.deploymentName}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {SURFACE_LABELS[d.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {version?.versionName ?? d.deployedVersionId}
                  </td>
                  <td className="px-3 py-2.5">
                    <AdminStatusLabel namespace={PLATFORM_REC_DEPLOYMENT_NS} code={d.deploymentStatus} ko={language !== "en"} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(d.deployedAt)}
                  </td>
                  <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {d.createdByAdminNickname}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
