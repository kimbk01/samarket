"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { getOpsRoutineTemplates } from "@/lib/ops-routines/mock-ops-routine-templates";
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

export function OpsRoutineTemplateTable() {
  const { t } = useI18n();
  const [category, setCategory] = useState<OpsRoutineCategory | "">("");
  const [cadence, setCadence] = useState<OpsRoutineCadence | "">("");
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_board_tpl_category")}</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as OpsRoutineCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {t(c.labelKey)}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_routines_label_period")}</span>
        <select
          value={cadence}
          onChange={(e) =>
            setCadence((e.target.value || "") as OpsRoutineCadence | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="weekly">{t("admin_ops_tools_period_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_period_monthly")}</option>
          <option value="quarterly">{t("admin_ops_tools_period_quarterly")}</option>
        </select>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_routines_tpl_empty")}</div>
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
