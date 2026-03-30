"use client";

import type { FavoriteStatusFilter } from "@/lib/products/favorite-utils";
import type { FavoriteSortKey } from "@/lib/products/favorite-utils";
import {
  FAVORITE_STATUS_OPTIONS,
  FAVORITE_SORT_OPTIONS,
} from "@/lib/products/favorite-utils";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

interface FavoriteFilterBarProps {
  statusFilter: FavoriteStatusFilter;
  onStatusFilterChange: (v: FavoriteStatusFilter) => void;
  sortKey: FavoriteSortKey;
  onSortKeyChange: (v: FavoriteSortKey) => void;
}

export function FavoriteFilterBar({
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortKeyChange,
}: FavoriteFilterBarProps) {
  return (
    <div className="space-y-3 border-b border-gray-100 bg-white px-4 py-3">
      <div className="flex gap-1 overflow-x-auto">
        {FAVORITE_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusFilterChange(opt.value)}
            className={`${APP_TOP_MENU_ROW1_BASE} ${
              statusFilter === opt.value ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-gray-500">정렬</span>
        <select
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as FavoriteSortKey)}
          className="rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-[13px] font-semibold text-gray-900"
        >
          {FAVORITE_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
