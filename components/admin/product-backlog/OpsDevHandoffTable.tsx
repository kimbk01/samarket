"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getOpsDevHandoffItems,
  getProductBacklogItemById,
} from "@/lib/product-backlog/product-backlog-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getHandoffStatusLabel,
  OPS_DEV_HANDOFF_STATUS_FILTER_OPTIONS,
} from "@/lib/product-backlog/product-backlog-utils";
import type { OpsDevHandoffStatus } from "@/lib/types/product-backlog";

export function OpsDevHandoffTable() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<OpsDevHandoffStatus | "">("");
  const items = useMemo(
    () =>
      getOpsDevHandoffItems(
        statusFilter ? { handoffStatus: statusFilter } : undefined
      ),
    [statusFilter]
  );

  const headers = useMemo(
    () => [
      t("admin_product_backlog_th_backlog_item"),
      t("admin_product_backlog_th_status"),
      t("admin_product_backlog_th_ops_summary"),
      t("admin_product_backlog_th_dev_note"),
      t("admin_product_backlog_th_requester"),
      t("admin_product_backlog_th_dev_assignee"),
    ],
    [t]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_handoff_status")}
        </span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as OpsDevHandoffStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {OPS_DEV_HANDOFF_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_product_backlog_handoff_hint")}
      </p>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_product_backlog_empty_handoff")}
        </div>
      ) : (
        <AdminTable headers={headers}>
          {items.map((h) => {
            const backlog = getProductBacklogItemById(h.backlogItemId);
            return (
              <tr key={h.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {backlog?.title ?? h.backlogItemId}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 sam-text-helper ${
                      h.handoffStatus === "shipped"
                        ? "bg-emerald-50 text-emerald-700"
                        : h.handoffStatus === "in_progress" || h.handoffStatus === "accepted"
                          ? "bg-blue-50 text-blue-700"
                          : h.handoffStatus === "returned"
                            ? "bg-red-50 text-red-700"
                            : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {getHandoffStatusLabel(t, h.handoffStatus)}
                  </span>
                </td>
                <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                  {h.opsSummary}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                  {h.devNote || "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {h.requestedByAdminNickname ?? "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {h.assignedDevName || "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
