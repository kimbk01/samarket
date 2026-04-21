"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRegionOptions } from "@/lib/regions/region-utils";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/types/category";
import type { SearchSortKey } from "@/lib/search/search-utils";
import { SEARCH_SORT_OPTIONS } from "@/lib/search/search-utils";

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "판매완료" },
];

export interface SearchFilters {
  regionId: string;
  category: string;
  status: string;
  sortKey: SearchSortKey;
}

interface SearchFilterBarProps {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  onReset: () => void;
}

const defaultFilters: SearchFilters = {
  regionId: "",
  category: "",
  status: "all",
  sortKey: "latest",
};

export function getDefaultSearchFilters(): SearchFilters {
  return { ...defaultFilters };
}

export function SearchFilterBar({
  filters,
  onChange,
  onReset,
}: SearchFilterBarProps) {
  const { tt, t } = useI18n();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  useEffect(() => {
    getCategories({ type: "trade", activeOnly: true }).then(setCategories);
  }, []);

  const hasActive =
    filters.regionId ||
    filters.category ||
    filters.status !== "all" ||
    filters.sortKey !== "latest";

  return (
    <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-sam-border-soft bg-sam-surface px-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.regionId}
          onChange={(e) =>
            onChange({ ...filters, regionId: e.target.value })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          <option value="">{t("common_all_region")}</option>
          {getRegionOptions().map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) =>
            onChange({ ...filters, category: e.target.value })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          <option value="">{t("common_all_category")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {tt(o.label)}
            </option>
          ))}
        </select>
        <select
          value={filters.sortKey}
          onChange={(e) =>
            onChange({ ...filters, sortKey: e.target.value as SearchSortKey })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          {SEARCH_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {tt(o.label)}
            </option>
          ))}
        </select>
      </div>
      {hasActive && (
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 sam-text-helper text-[#999999] underline"
        >
          {t("common_reset_filters")}
        </button>
      )}
    </div>
  );
}
