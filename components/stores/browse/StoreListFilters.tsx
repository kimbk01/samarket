"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresBrowseCustomerSortAvailability } from "@/lib/stores/stores-browse-customer-sort-availability";
import { STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT } from "@/lib/stores/stores-browse-customer-sort-availability";

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
  { id: "popular", labelKey: "nav_store_sort_popular" },
  { id: "rating", labelKey: "nav_store_sort_rating" },
  { id: "distance", labelKey: "nav_store_sort_distance" },
];

const CHIP_BASE =
  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none transition-colors border";
const CHIP_OFF = "border-sam-border bg-sam-surface text-sam-muted";
const CHIP_ON = "border-signature bg-signature text-white";

export function StoreListFilters({
  sort,
  onSortChange,
  hasGeo,
  availability = STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT,
}: {
  sort: StoreBrowseSortId;
  onSortChange: (id: StoreBrowseSortId) => void;
  /** 위치 꺼져 있으면 가까운순 비활성 안내 */
  hasGeo: boolean;
  availability?: StoresBrowseCustomerSortAvailability;
}) {
  const { t } = useI18n();
  const visible = SORTS.filter((s) => {
    if (s.id === "popular") return availability.popular;
    if (s.id === "rating") return availability.rating;
    if (s.id === "distance") return availability.distance;
    return true;
  });
  return (
    <div className="flex items-center gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visible.map(({ id, labelKey }) => {
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
