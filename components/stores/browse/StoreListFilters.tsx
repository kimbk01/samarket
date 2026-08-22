"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type StoreBrowseSortId = "default" | "distance" | "rating" | "reviews" | "popular" | "fast";

const SORTS: {
  id: StoreBrowseSortId;
  labelKey:
    | "nav_store_sort_default"
    | "nav_store_sort_distance"
    | "nav_store_sort_rating"
    | "nav_store_sort_reviews"
    | "nav_store_sort_popular"
    | "nav_store_sort_fast";
}[] = [
  { id: "default", labelKey: "nav_store_sort_default" },
  { id: "distance", labelKey: "nav_store_sort_distance" },
  { id: "rating", labelKey: "nav_store_sort_rating" },
  { id: "reviews", labelKey: "nav_store_sort_reviews" },
  { id: "popular", labelKey: "nav_store_sort_popular" },
  { id: "fast", labelKey: "nav_store_sort_fast" },
];

const CHIP_BASE =
  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none transition-colors border";
const CHIP_OFF = "border-sam-border bg-sam-surface text-sam-muted";
const CHIP_ON = "border-signature bg-signature text-white";

export function StoreListFilters({
  sort,
  onSortChange,
  hasGeo,
}: {
  sort: StoreBrowseSortId;
  onSortChange: (id: StoreBrowseSortId) => void;
  /** 위치 꺼져 있으면 가까운순 비활성 안내 */
  hasGeo: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SORTS.map(({ id, labelKey }) => {
        const on = sort === id;
        const disabled = id === "distance" && !hasGeo;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            title={disabled ? t("nav_store_geo_required_hint") : undefined}
            onClick={() => {
              if (!disabled) onSortChange(id);
            }}
            className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF} ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
