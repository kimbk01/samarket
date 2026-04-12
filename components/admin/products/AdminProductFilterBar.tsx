"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { Product, ProductStatus } from "@/lib/types/product";
import {
  STATUS_OPTIONS,
  SORT_OPTIONS,
  getCategoryOptions,
  type AdminProductFilters,
  type AdminProductSortKey,
} from "@/lib/admin-products/admin-product-utils";

export interface AdminProductFilterBarProps {
  filters: AdminProductFilters;
  products: Product[];
  searchQuery: string;
  onFiltersChange: (f: AdminProductFilters) => void;
  onSearchChange: (q: string) => void;
}

export function AdminProductFilterBar({
  filters,
  products,
  searchQuery,
  onFiltersChange,
  onSearchChange,
}: AdminProductFilterBarProps) {
  const { tt, t } = useI18n();
  const categories = getCategoryOptions(products);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={t("admin_search_product")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-[180px] rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={filters.status}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: e.target.value as ProductStatus | "",
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {tt(o.label)}
            </option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
        >
          <option value="">{t("admin_category_all")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t("common_region")}
          value={filters.location}
          onChange={(e) => onFiltersChange({ ...filters, location: e.target.value })}
          className="min-w-[100px] rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={filters.sortKey}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              sortKey: e.target.value as AdminProductSortKey,
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {tt(o.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
