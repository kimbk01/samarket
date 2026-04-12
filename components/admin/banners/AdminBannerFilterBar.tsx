"use client";

import type { AdminBannerFilters } from "@/lib/admin-banners/admin-banner-utils";
import {
  BANNER_STATUS_OPTIONS,
  BANNER_PLACEMENT_OPTIONS,
} from "@/lib/admin-banners/admin-banner-utils";

interface AdminBannerFilterBarProps {
  filters: AdminBannerFilters;
  onChange: (f: AdminBannerFilters) => void;
}

export function AdminBannerFilterBar({ filters, onChange }: AdminBannerFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({ ...filters, status: e.target.value as AdminBannerFilters["status"] })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {BANNER_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filters.placement}
        onChange={(e) =>
          onChange({ ...filters, placement: e.target.value as AdminBannerFilters["placement"] })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {BANNER_PLACEMENT_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
