"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { Product, ProductStatus } from "@/lib/types/product";
import type { CategoryWithSettings } from "@/lib/categories/types";
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
  /** `/admin/menus/trade` 홈 칩과 동일한 거래 루트 — `fetchTradeHomeRootCategories` 결과 */
  tradeMenuRoots?: CategoryWithSettings[];
  tradeMenuRootId: string;
  onTradeMenuRootIdChange: (rootId: string) => void;
}

export function AdminProductFilterBar({
  filters,
  products,
  searchQuery,
  onFiltersChange,
  onSearchChange,
  tradeMenuRoots = [],
  tradeMenuRootId,
  onTradeMenuRootIdChange,
}: AdminProductFilterBarProps) {
  const { tt, t } = useI18n();
  const categories = getCategoryOptions(products);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tradeMenuRoots.length > 0 ? (
          <select
            value={tradeMenuRootId}
            onChange={(e) => onTradeMenuRootIdChange(e.target.value)}
            className="min-w-[140px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
            aria-label="거래 메뉴(홈 탭)"
          >
            <option value="">거래 메뉴 전체</option>
            {tradeMenuRoots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          placeholder={t("admin_search_product")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-[180px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={filters.status}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: e.target.value as ProductStatus | "",
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
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
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
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
          className="min-w-[100px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={filters.sortKey}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              sortKey: e.target.value as AdminProductSortKey,
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
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
