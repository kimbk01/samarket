"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsActionStatus } from "@/lib/types/ops-board";
import { getOpsActionItems } from "@/lib/ops-board/mock-ops-action-items";
import { getOverdueActionItems } from "@/lib/ops-board/mock-ops-action-items";
import { OPS_TOOLS_ACTION_STATUS_KEYS, opsToolsLabel } from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { OpsActionCard } from "./OpsActionCard";

export function OpsActionBoard() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OpsActionStatus | "">("");

  const allItems = useMemo(
    () => getOpsActionItems({ limit: 100 }),
    [refresh]
  );
  const overdueItems = useMemo(() => getOverdueActionItems(), [refresh]);

  const items = useMemo(() => {
    if (statusFilter) return allItems.filter((a) => a.status === statusFilter);
    return allItems;
  }, [allItems, statusFilter]);

  const statusOptions: { value: OpsActionStatus | ""; labelKey: keyof typeof OPS_TOOLS_ACTION_STATUS_KEYS | "all" }[] = [
    { value: "", labelKey: "all" },
    { value: "open", labelKey: "open" },
    { value: "planned", labelKey: "planned" },
    { value: "in_progress", labelKey: "in_progress" },
    { value: "done", labelKey: "done" },
    { value: "archived", labelKey: "archived" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value === "" ? "" : (e.target.value as OpsActionStatus))
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {statusOptions.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.labelKey === "all"
                ? t("admin_ops_tools_board_filter_status")
                : t(opsToolsLabel(OPS_TOOLS_ACTION_STATUS_KEYS, o.labelKey))}
            </option>
          ))}
        </select>
        {overdueItems.length > 0 && (
          <span className="rounded bg-red-100 px-2 py-1 sam-text-body-secondary font-medium text-red-800">
            {t("admin_ops_tools_board_overdue_count", { count: overdueItems.length })}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ops_tools_board_no_actions")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <OpsActionCard
              key={item.id}
              item={item}
              onUpdate={() => setRefresh((r) => r + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
