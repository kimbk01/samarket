"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
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
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

export function OpsDevHandoffTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery();
  const statusFilter = lq.query.status as OpsDevHandoffStatus | "";
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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_handoff_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          {OPS_DEV_HANDOFF_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_product_backlog_handoff_hint")}
      </p>

      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_product_backlog_empty_handoff")} onReset={lq.isFiltered ? lq.reset : undefined} />
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
                        ? "bg-sam-success-soft text-sam-success"
                        : h.handoffStatus === "in_progress" || h.handoffStatus === "accepted"
                          ? "bg-sam-info-soft text-sam-info"
                          : h.handoffStatus === "returned"
                            ? "bg-sam-danger-soft text-sam-danger"
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
