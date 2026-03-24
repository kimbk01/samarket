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
        className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
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
