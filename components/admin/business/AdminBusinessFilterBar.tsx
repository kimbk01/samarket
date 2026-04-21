"use client";

import type { AdminBusinessFilters } from "@/lib/business/business-utils";
import { BUSINESS_STATUS_OPTIONS } from "@/lib/business/business-utils";

interface AdminBusinessFilterBarProps {
  filters: AdminBusinessFilters;
  onChange: (f: AdminBusinessFilters) => void;
}

export function AdminBusinessFilterBar({
  filters,
  onChange,
}: AdminBusinessFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({
            ...filters,
            status: e.target.value as AdminBusinessFilters["status"],
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {BUSINESS_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
