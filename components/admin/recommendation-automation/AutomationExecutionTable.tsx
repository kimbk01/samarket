"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { adminPaginationPageCount, clampAdminPage } from "@/lib/admin/pagination/admin-pagination-window";
import { RecommendationFilterSelect } from "@/components/admin/recommendation-admin-filter-select";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
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
  /** surface 필터 — 주소 `?surface=` 보존 (R7) */
  const lq = useAdminListQuery<"surface">({ extras: ["surface"] });
  const surfaceFilter: RecommendationSurface | "" = (["home", "search", "shop"] as const).includes(
    lq.query.extras.surface as "home"
  )
    ? (lq.query.extras.surface as RecommendationSurface)
    : "";

  /** 보관된 실행 이력 전체(번들) 중 필터 결과 → 화면 쪽 나눔 20/50/100 (R7 — 예전: 최신 50건만). */
  const allExecutions = useMemo(
    () =>
      getRecommendationAutomationExecutions({
        surface: surfaceFilter || undefined,
        limit: null,
      }),
    [refresh, surfaceFilter]
  );
  const total = allExecutions.length;
  const page = clampAdminPage(lq.query.page, adminPaginationPageCount(total, lq.query.size));
  const executions = allExecutions.slice((page - 1) * lq.query.size, page * lq.query.size);

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
          label={t("admin_rec_th_surface")}
          value={surfaceFilter}
          allLabel={t("admin_rec_filter_all_surface")}
          options={[
            { value: "home", label: t("admin_rec_surface_home") },
            { value: "search", label: t("admin_rec_surface_search") },
            { value: "shop", label: t("admin_rec_surface_shop") },
          ]}
          onChange={(v) => lq.setExtra("surface", v)}
          name="surface"
        />
      </AdminFilterBar>
      {executions.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={surfaceFilter ? undefined : t("admin_rec_auto_empty_executions")}
          onReset={surfaceFilter ? lq.reset : undefined}
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
      {total > 0 ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
        />
      ) : null}
    </div>
  );
}
