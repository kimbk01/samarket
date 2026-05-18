"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBannerFilters } from "@/lib/admin-banners/admin-banner-utils";
import type { BannerPlacement, BannerStatus } from "@/lib/types/admin-banner";
import {
  ADMIN_BANNER_PLACEMENT_KEYS,
  ADMIN_BANNER_STATUS_KEYS,
} from "./admin-banner-i18n";

interface AdminBannerFilterBarProps {
  filters: AdminBannerFilters;
  onChange: (f: AdminBannerFilters) => void;
}

const STATUS_FILTER_VALUES: (BannerStatus | "")[] = [
  "",
  "draft",
  "active",
  "paused",
  "expired",
  "hidden",
];

const PLACEMENT_FILTER_VALUES: (BannerPlacement | "")[] = [
  "",
  "home_top",
  "home_middle",
  "product_detail",
  "search_top",
  "mypage_top",
];

export function AdminBannerFilterBar({ filters, onChange }: AdminBannerFilterBarProps) {
  const { t } = useI18n();

  const statusOptions = useMemo(
    () =>
      STATUS_FILTER_VALUES.map((value) => ({
        value,
        label:
          value === ""
            ? t("common_all")
            : t(ADMIN_BANNER_STATUS_KEYS[value]),
      })),
    [t]
  );

  const placementOptions = useMemo(
    () =>
      PLACEMENT_FILTER_VALUES.map((value) => ({
        value,
        label:
          value === ""
            ? t("admin_banners_filter_placement_all")
            : t(ADMIN_BANNER_PLACEMENT_KEYS[value]),
      })),
    [t]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({ ...filters, status: e.target.value as AdminBannerFilters["status"] })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {statusOptions.map((o) => (
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
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {placementOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
