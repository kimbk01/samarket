"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type StoreBrowseSortId = "default" | "distance" | "rating" | "reviews" | "fast";

const SORTS: {
  id: StoreBrowseSortId;
  label: string;
  labelKey:
    | "nav_store_sort_default"
    | "nav_store_sort_distance"
    | "nav_store_sort_rating"
    | "nav_store_sort_reviews"
    | "nav_store_sort_fast";
}[] = [
  { id: "default", label: "기본순", labelKey: "nav_store_sort_default" },
  { id: "distance", label: "가까운순", labelKey: "nav_store_sort_distance" },
  { id: "rating", label: "평점순", labelKey: "nav_store_sort_rating" },
  { id: "reviews", label: "리뷰많은순", labelKey: "nav_store_sort_reviews" },
  { id: "fast", label: "배달빠른순", labelKey: "nav_store_sort_fast" },
];

const CHIP_BASE =
  "shrink-0 rounded-full px-2.5 py-1 sam-text-xxs font-semibold transition-colors border";
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-xxs font-bold uppercase tracking-wide text-sam-meta">{t("common_sort")}</span>
        <div className="flex flex-wrap gap-1">
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
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF} ${
                  disabled ? "cursor-not-allowed opacity-45" : ""
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <Link
        href="/regions"
        className="inline-flex items-center rounded-full border border-dashed border-sam-border bg-sam-surface px-2.5 py-1 sam-text-xxs font-semibold text-sam-fg active:bg-sam-app"
      >
        {t("nav_store_region_settings")}
      </Link>
    </div>
  );
}
