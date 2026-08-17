"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/types/category";
import { resolveTradeCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";
import { CompositionAttributeFilterSelects } from "@/components/search/CompositionAttributeFilterSelects";
import {
  resolveTradeCompositionForCategory,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form";

export type MarketplaceSearchSort = "newest" | "distance";

export interface SearchFilters {
  categoryId: string;
  status: "all" | "active" | "sold";
  sortKey: MarketplaceSearchSort;
  priceMin: string;
  priceMax: string;
  compositionFilters: CompositionFilterSelection;
}

interface SearchFilterBarProps {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  onReset: () => void;
  distanceEnabled: boolean;
}

const defaultFilters: SearchFilters = {
  categoryId: "",
  status: "all",
  sortKey: "newest",
  priceMin: "",
  priceMax: "",
  compositionFilters: {},
};

export function getDefaultSearchFilters(): SearchFilters {
  return { ...defaultFilters, compositionFilters: {} };
}

export function SearchFilterBar({
  filters,
  onChange,
  onReset,
  distanceEnabled,
}: SearchFilterBarProps) {
  const { t, safeT, language } = useI18n();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  useEffect(() => {
    getCategories({ type: "trade", activeOnly: true }).then(setCategories);
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: "all" as const, label: safeT("common_all") },
      { value: "active" as const, label: safeT("trade_market_sort_active") },
      { value: "sold" as const, label: safeT("trade_listing_step_completed") },
    ],
    [safeT]
  );

  const selectedCategory = categories.find((c) => c.id === filters.categoryId) ?? null;
  const composition = selectedCategory ? resolveTradeCompositionForCategory(selectedCategory) : null;

  const hasActive =
    Boolean(filters.categoryId) ||
    filters.status !== "all" ||
    filters.sortKey !== "newest" ||
    Boolean(filters.priceMin.trim()) ||
    Boolean(filters.priceMax.trim()) ||
    Object.keys(filters.compositionFilters).length > 0;

  return (
    <div className="flex min-h-10 flex-shrink-0 items-center gap-2 border-b border-sam-border-soft bg-sam-surface px-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.categoryId}
          onChange={(e) =>
            onChange({
              ...filters,
              categoryId: e.target.value,
              compositionFilters: {},
            })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          <option value="">{safeT("common_all_category")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {resolveTradeCategoryUILabel(language, c.name, c.name_en, c.slug, c.icon_key)}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            onChange({
              ...filters,
              status: e.target.value as SearchFilters["status"],
            })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={distanceEnabled ? filters.sortKey : "newest"}
          onChange={(e) =>
            onChange({
              ...filters,
              sortKey: e.target.value as MarketplaceSearchSort,
            })
          }
          className="min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          <option value="newest">{safeT("trade_market_sort_latest")}</option>
          {distanceEnabled ? (
            <option value="distance">
              {safeT("trade_market_sort_distance", {
                fallbackKo: "가까운순",
                fallbackEn: "Nearest",
              })}
            </option>
          ) : null}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={filters.priceMin}
          onChange={(e) => onChange({ ...filters, priceMin: e.target.value })}
          placeholder={safeT("trade_market_price_min", {
            fallbackKo: "최소 가격",
            fallbackEn: "Min price",
          })}
          className="min-h-[44px] w-[7.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={filters.priceMax}
          onChange={(e) => onChange({ ...filters, priceMax: e.target.value })}
          placeholder={safeT("trade_market_price_max", {
            fallbackKo: "최대 가격",
            fallbackEn: "Max price",
          })}
          className="min-h-[44px] w-[7.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
        />
        <CompositionAttributeFilterSelects
          composition={composition}
          selection={filters.compositionFilters}
          onChange={(compositionFilters) => onChange({ ...filters, compositionFilters })}
        />
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
