"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsActionStatus } from "@/lib/types/ops-board";
import { getOpsActionItems } from "@/lib/ops-board/ops-board-state";
import { getOverdueActionItems } from "@/lib/ops-board/ops-board-state";
import { OPS_TOOLS_ACTION_STATUS_KEYS, opsToolsLabel } from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { OpsActionCard } from "./OpsActionCard";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";

const ACTION_STATUSES = ["open", "planned", "in_progress", "done", "archived"] as const;

export function OpsActionBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  /** 상태 필터는 주소(`?status=`)에 보존 (R7). */
  const lq = useAdminListQuery({ statuses: ACTION_STATUSES });
  const statusFilter = lq.query.status as OpsActionStatus | "";

  /** 고정 상한(100건) 없이 번들 전체 — 운영 보드 번들은 한 행(JSON)으로 통째로 불러오는 구조. */
  const allItems = useMemo(
    () => getOpsActionItems({ limit: Number.MAX_SAFE_INTEGER }),
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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: statusOptions
            .filter((o) => o.labelKey !== "all")
            .map((o) => ({
              value: o.value,
              label: t(opsToolsLabel(OPS_TOOLS_ACTION_STATUS_KEYS, o.labelKey as keyof typeof OPS_TOOLS_ACTION_STATUS_KEYS)),
            })),
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {overdueItems.length > 0 && (
          <span className="rounded bg-sam-danger-soft px-2 py-1 sam-text-body-secondary font-medium text-sam-danger">
            {t("admin_ops_tools_board_overdue_count", { count: overdueItems.length })}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_ops_tools_board_no_actions")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
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
