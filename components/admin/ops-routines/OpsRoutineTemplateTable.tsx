"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getOpsRoutineTemplates } from "@/lib/ops-routines/ops-routines-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCategoryLabel,
  getCadenceLabel,
  getPriorityLabel,
} from "@/lib/ops-routines/ops-routines-utils";
import type {
  OpsRoutineCategory,
  OpsRoutineCadence,
} from "@/lib/types/ops-routines";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["category", "cadence"] as const;

export function OpsRoutineTemplateTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const category = lq.query.extras.category as OpsRoutineCategory | "";
  const cadence = lq.query.extras.cadence as OpsRoutineCadence | "";
  const templates = useMemo(
    () =>
      getOpsRoutineTemplates({
        ...(category ? { category: category as OpsRoutineCategory } : {}),
        ...(cadence ? { cadence: cadence as OpsRoutineCadence } : {}),
      }),
    [category, cadence]
  );

  const categories: { value: OpsRoutineCategory | ""; labelKey: MessageKey }[] = [
    { value: "", labelKey: "common_all" },
    { value: "monitoring", labelKey: "admin_ops_tools_routine_cat_monitoring" },
    { value: "moderation", labelKey: "admin_ops_tools_routine_cat_moderation" },
    { value: "content", labelKey: "admin_ops_tools_routine_cat_content" },
    { value: "points", labelKey: "admin_ops_tools_routine_cat_points" },
    { value: "ads", labelKey: "admin_ops_tools_routine_cat_ads" },
    { value: "recommendation", labelKey: "admin_ops_tools_routine_cat_recommendation" },
    { value: "docs", labelKey: "admin_ops_tools_routine_cat_docs" },
    { value: "automation", labelKey: "admin_ops_tools_routine_cat_automation" },
    { value: "reporting", labelKey: "admin_ops_tools_routine_cat_reporting" },
    { value: "security", labelKey: "admin_ops_tools_routine_cat_security" },
  ];

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
        <AdminFilterSelect ko={ko} label={t("admin_ops_tools_board_tpl_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {t(c.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_ops_tools_routines_label_period")} name="cadence" value={lq.query.extras.cadence} onChange={(v) => lq.setExtra("cadence", v)}>
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="weekly">{t("admin_ops_tools_period_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_period_monthly")}</option>
          <option value="quarterly">{t("admin_ops_tools_period_quarterly")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {templates.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_tools_routines_tpl_empty")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[
            t("admin_ops_tools_routines_th_title"),
            t("admin_ops_tools_routines_th_category"),
            t("admin_ops_tools_routines_th_period"),
            t("admin_ops_tools_board_th_priority"),
            t("admin_ops_tools_routines_th_sla"),
            t("admin_ops_tools_routines_th_role"),
            t("admin_ops_tools_routines_th_active"),
          ]}
        >
          {templates.map((t) => (
            <tr key={t.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {t.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getCategoryLabel(t.category)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getCadenceLabel(t.cadence)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(t.defaultPriority)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t.slaDays ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t.defaultOwnerRole || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {t.isActive ? "Y" : "N"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
