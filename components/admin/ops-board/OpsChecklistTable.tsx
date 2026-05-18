"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsChecklistItemStatus } from "@/lib/types/ops-board";
import { getOpsDailyChecklistItems } from "@/lib/ops-board/mock-ops-daily-checklist-items";
import { updateOpsDailyChecklistItem } from "@/lib/ops-board/mock-ops-daily-checklist-items";
import { createTodayChecklist } from "@/lib/ops-board/ops-board-utils";
import {
  OPS_TOOLS_CHECKLIST_CATEGORY_KEYS,
  OPS_TOOLS_CHECKLIST_STATUS_KEYS,
  OPS_TOOLS_PRIORITY_KEYS,
  OPS_TOOLS_SURFACE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

export function OpsChecklistTable() {
  const { t } = useI18n();
  const [checklistDate, setChecklistDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [refresh, setRefresh] = useState(0);

  const items = useMemo(
    () => getOpsDailyChecklistItems(checklistDate),
    [checklistDate, refresh]
  );

  const handleStatusChange = (id: string, status: OpsChecklistItemStatus) => {
    updateOpsDailyChecklistItem(id, {
      status,
      checkedAt: status === "done" ? new Date().toISOString() : null,
    });
    setRefresh((r) => r + 1);
  };

  const handleCreateFromTemplates = () => {
    createTodayChecklist(checklistDate);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_board_check_date")}</label>
        <input
          type="date"
          value={checklistDate}
          onChange={(e) => setChecklistDate(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <button
          type="button"
          onClick={handleCreateFromTemplates}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_ops_tools_board_gen_checklist")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ops_tools_board_no_checklist")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_title")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_category")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_priority")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_status")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_owner")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {i.title}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_CATEGORY_KEYS, i.category))} /{" "}
                    {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, i.surface))}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, i.priority))}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        i.status === "done"
                          ? "bg-emerald-50 text-emerald-800"
                          : i.status === "in_progress"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_STATUS_KEYS, i.status))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {i.assignedAdminNickname ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status !== "done" && i.status !== "skipped" && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "in_progress")}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 sam-text-helper text-amber-800"
                        >
                          {t("admin_ops_tools_board_btn_progress")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "done")}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 sam-text-helper text-emerald-800"
                        >
                          {t("admin_ops_tools_board_btn_complete")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "skipped")}
                          className="rounded border border-sam-border bg-sam-surface-muted px-2 py-1 sam-text-helper text-sam-muted"
                        >
                          {t("admin_ops_tools_board_btn_skip")}
                        </button>
                      </div>
                    )}
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
