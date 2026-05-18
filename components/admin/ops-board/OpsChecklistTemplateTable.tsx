"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsChecklistTemplates } from "@/lib/ops-board/mock-ops-checklist-templates";
import {
  OPS_TOOLS_CHECKLIST_CATEGORY_KEYS,
  OPS_TOOLS_PRIORITY_KEYS,
  OPS_TOOLS_SURFACE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

export function OpsChecklistTemplateTable() {
  const { t } = useI18n();
  const templates = useMemo(() => getOpsChecklistTemplates(), []);

  if (templates.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_ops_tools_board_tpl_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ops_tools_board_tpl_order")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ops_tools_board_th_title")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ops_tools_board_tpl_category")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ops_tools_board_tpl_surface_prio")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ops_tools_board_tpl_usage")}
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((tpl) => (
            <tr
              key={tpl.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{tpl.sortOrder}</td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {tpl.title}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_CATEGORY_KEYS, tpl.category))}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, tpl.defaultSurface))} /{" "}
                {t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, tpl.defaultPriority))}
              </td>
              <td className="px-3 py-2.5">
                {tpl.isActive ? (
                  <span className="sam-text-body-secondary text-emerald-600">ON</span>
                ) : (
                  <span className="sam-text-body-secondary text-sam-meta">OFF</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
