"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresBrowseCustomerSortAvailability } from "@/lib/stores/stores-browse-customer-sort-availability";
import { STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT } from "@/lib/stores/stores-browse-customer-sort-availability";
import { DELIVERY_TOUCH_HIT_EXPAND_CLASS } from "@/lib/stores/delivery-touch-target";

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

/** S3-08 · UI-11 — 칩 높이 = `--delivery-sticky-tab-h`(36px, 토큰 주석 「정렬 칩과 동일」), 터치 영역 44px */
const CHIP_BASE = `inline-flex h-[var(--delivery-sticky-tab-h)] shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold leading-none transition-colors ${DELIVERY_TOUCH_HIT_EXPAND_CLASS}`;
const CHIP_OFF = "border-sam-border bg-sam-surface text-sam-muted active:bg-sam-surface-muted";
const CHIP_ON = "border-signature bg-signature text-white active:opacity-90";
/** 비활성(위치 없음 「거리순」) — 불투명도 대신 회색 토큰 배경·글자 (sam-chip--disabled 와 같은 값) */
const CHIP_DISABLED = "cursor-not-allowed border-transparent bg-[color:var(--sam-primary-disabled)] text-sam-muted";

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
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            className={`${CHIP_BASE} ${disabled ? CHIP_DISABLED : on ? CHIP_ON : CHIP_OFF}`}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
