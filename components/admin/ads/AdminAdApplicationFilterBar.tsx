"use client";

import type { AdminAdApplicationFilters } from "@/lib/ads/ad-utils";
import { AD_APPLICATION_STATUS_OPTIONS } from "@/lib/ads/ad-utils";

interface AdminAdApplicationFilterBarProps {
  filters: AdminAdApplicationFilters;
  onChange: (f: AdminAdApplicationFilters) => void;
}

export function AdminAdApplicationFilterBar({
  filters,
  onChange,
}: AdminAdApplicationFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.applicationStatus}
        onChange={(e) =>
          onChange({
            ...filters,
            applicationStatus: e.target
              .value as AdminAdApplicationFilters["applicationStatus"],
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {AD_APPLICATION_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
