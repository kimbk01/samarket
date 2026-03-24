"use client";

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
  const categories = getCategoryOptions(products);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="상품명·판매자·ID 검색"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-[180px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
        />
        <select
          value={filters.status}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: e.target.value as ProductStatus | "",
            })
          }
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
        >
          <option value="">카테고리 전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="지역"
          value={filters.location}
          onChange={(e) => onFiltersChange({ ...filters, location: e.target.value })}
          className="min-w-[100px] rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800 placeholder:text-gray-400"
        />
        <select
          value={filters.sortKey}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              sortKey: e.target.value as AdminProductSortKey,
            })
          }
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-800"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
