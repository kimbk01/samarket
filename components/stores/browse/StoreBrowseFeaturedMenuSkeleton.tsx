"use client";

import { STORES_BROWSE_CATEGORY_PRESENTATION } from "@/lib/stores/stores-browse-category-presentation-spec";

/** browse 카드 메뉴 미리보기 deferred 로딩 — legacy 116px 3-up · category 90.7px 4-up */
const LEGACY_BAND_H = "h-[116px]";
const CATEGORY_TILE_H = `${STORES_BROWSE_CATEGORY_PRESENTATION.menuTileHeightPx}px`;

type StoreBrowseFeaturedMenuSkeletonProps = {
  variant?: "legacy" | "category";
};

export function StoreBrowseFeaturedMenuSkeleton({
  variant = "legacy",
}: StoreBrowseFeaturedMenuSkeletonProps) {
  if (variant === "category") {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="stores-category-menu-tile overflow-hidden rounded-[2.9px] bg-[color:var(--delivery-bg-muted)]"
            style={{ height: CATEGORY_TILE_H }}
            data-store-browse-menu-pending="true"
            aria-hidden
          />
        ))}
      </>
    );
  }

  return (
    <div
      className={`flex min-h-[116px] snap-x snap-mandatory gap-1 overflow-hidden ${LEGACY_BAND_H}`}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={[
            "shrink-0 snap-start overflow-hidden",
            "w-[calc((100%-8px)/3)]",
            LEGACY_BAND_H,
            "bg-[color:var(--delivery-bg-muted)]",
          ].join(" ")}
          data-store-browse-menu-pending="true"
        />
      ))}
    </div>
  );
}
