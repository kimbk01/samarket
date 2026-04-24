"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { tt, t } = useI18n();
  return (
    <div className="space-y-3 border-b border-sam-border-soft bg-sam-surface px-4 py-3">
      <div className="sam-tabs sam-tabs--scroll">
        {FAVORITE_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusFilterChange(opt.value)}
            className={`${APP_TOP_MENU_ROW1_BASE} ${
              statusFilter === opt.value ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
            }`}
          >
            {tt(opt.label)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="sam-text-helper text-sam-muted">{t("common_sort")}</span>
        <select
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as FavoriteSortKey)}
          className="sam-select min-h-0 py-1"
        >
          {FAVORITE_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {tt(opt.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
