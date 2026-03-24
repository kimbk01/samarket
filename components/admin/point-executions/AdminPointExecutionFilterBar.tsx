"use client";

import type {
  AdminPointExecutionFilters,
  PointRewardExecutionStatus,
  PointRewardActionType,
} from "@/lib/point-executions/point-execution-utils";
import {
  EXECUTION_STATUS_OPTIONS,
  POINT_REWARD_ACTION_LABELS,
} from "@/lib/point-executions/point-execution-utils";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";

interface AdminPointExecutionFilterBarProps {
  filters: AdminPointExecutionFilters;
  onFiltersChange: (f: AdminPointExecutionFilters) => void;
}

export function AdminPointExecutionFilterBar({
  filters,
  onFiltersChange,
}: AdminPointExecutionFilterBarProps) {
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
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px]"
      >
        {EXECUTION_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.boardKey}
        onChange={(e) =>
          onFiltersChange({ ...filters, boardKey: e.target.value })
        }
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px]"
      >
        <option value="">전체 게시판</option>
        {BOARD_OPTIONS.map((b) => (
          <option key={b.key} value={b.key}>
            {b.name}
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
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px]"
      >
        <option value="">전체 행동</option>
        <option value="write">{POINT_REWARD_ACTION_LABELS.write}</option>
        <option value="comment">{POINT_REWARD_ACTION_LABELS.comment}</option>
      </select>
      <input
        type="text"
        placeholder="사용자 ID"
        value={filters.userId}
        onChange={(e) =>
          onFiltersChange({ ...filters, userId: e.target.value })
        }
        className="min-w-[120px] rounded border border-gray-200 px-3 py-2 text-[14px]"
      />
    </div>
  );
}
