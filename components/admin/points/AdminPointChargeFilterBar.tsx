"use client";

import type { AdminPointChargeFilters } from "@/lib/points/point-utils";
import { POINT_CHARGE_STATUS_OPTIONS } from "@/lib/points/point-utils";

interface AdminPointChargeFilterBarProps {
  filters: AdminPointChargeFilters;
  onChange: (f: AdminPointChargeFilters) => void;
}

export function AdminPointChargeFilterBar({
  filters,
  onChange,
}: AdminPointChargeFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.requestStatus}
        onChange={(e) =>
          onChange({
            ...filters,
            requestStatus: e.target
              .value as AdminPointChargeFilters["requestStatus"],
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {POINT_CHARGE_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
