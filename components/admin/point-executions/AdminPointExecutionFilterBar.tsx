"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointExecStatusLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
import type {
  AdminPointExecutionFilters,
  PointRewardExecutionStatus,
  PointRewardActionType,
} from "@/lib/point-executions/point-execution-utils";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";

interface AdminPointExecutionFilterBarProps {
  filters: AdminPointExecutionFilters;
  onFiltersChange: (f: AdminPointExecutionFilters) => void;
}

const EXEC_STATUSES: PointRewardExecutionStatus[] = ["success", "blocked", "reversed"];

export function AdminPointExecutionFilterBar({
  filters,
  onFiltersChange,
}: AdminPointExecutionFilterBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filters.status}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            status: e.target.value as PointRewardExecutionStatus | "",
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
      >
        <option value="">{t("common_all")}</option>
        {EXEC_STATUSES.map((status) => (
          <option key={status} value={status}>
            {pointExecStatusLabel(t, status)}
          </option>
        ))}
      </select>
      <select
        value={filters.boardKey}
        onChange={(e) =>
          onFiltersChange({ ...filters, boardKey: e.target.value })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
      >
        <option value="">{t("admin_points_filter_all_boards")}</option>
        {BOARD_OPTIONS.map((b) => (
          <option key={b.key} value={b.key}>
            {pointBoardLabel(t, b.key)}
          </option>
        ))}
      </select>
      <select
        value={filters.actionType}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            actionType: e.target.value as PointRewardActionType | "",
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
      >
        <option value="">{t("admin_points_filter_all_actions")}</option>
        <option value="write">{pointActionTypeLabel(t, "write")}</option>
        <option value="comment">{pointActionTypeLabel(t, "comment")}</option>
      </select>
      <input
        type="text"
        placeholder={t("admin_points_ph_user_id")}
        value={filters.userId}
        onChange={(e) =>
          onFiltersChange({ ...filters, userId: e.target.value })
        }
        className="min-w-[120px) rounded border border-sam-border px-3 py-2 sam-text-body"
      />
    </div>
  );
}
