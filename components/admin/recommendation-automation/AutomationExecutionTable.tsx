"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getRecommendationAutomationExecutions } from "@/lib/recommendation-ops/recommendation-runtime-state";
import {
  recAutoActionLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { PLATFORM_REC_EXECUTION_NS } from "@/lib/admin/status-labels/platform-status-labels";

export function AutomationExecutionTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");

  const executions = useMemo(
    () =>
      getRecommendationAutomationExecutions({
        surface: surfaceFilter || undefined,
        limit: 50,
      }),
    [refresh, surfaceFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === "" ? "" : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_filter_all_surface")}</option>
          <option value="home">{t("admin_rec_surface_home")}</option>
          <option value="search">{t("admin_rec_surface_search")}</option>
          <option value="shop">{t("admin_rec_surface_shop")}</option>
        </select>
      </div>
      {executions.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={surfaceFilter ? undefined : t("admin_rec_auto_empty_executions")}
          onReset={surfaceFilter ? () => { setSurfaceFilter(""); } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_datetime")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_surface")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_action")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_mode")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_result")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_reason")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_before_after")}
                </th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recSurfaceLabel(t, e.surface)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recAutoActionLabel(t, e.actionType)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {e.executionMode === "dry_run"
                      ? t("admin_rec_auto_sim_mode_dry_run")
                      : t("admin_rec_auto_sim_mode_live")}
                  </td>
                  <td className="px-3 py-2.5">
<AdminStatusLabel namespace={PLATFORM_REC_EXECUTION_NS} code={e.status} ko={language !== "en"} />
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {e.reason}
                  </td>
                  <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {e.beforeState} → {e.afterState}
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
