"use client";

/**
 * HOME §3.5 High-rating horizontal food card — larger image, rating emphasis.
 * OBSERVED anatomy partial; exact overlay geometry NOT_PROVEN.
 */

import Link from "next/link";
import { memo } from "react";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import { STORES_HOME_PRESENTATION_SPEC } from "@/lib/stores/presentation/stores-home-presentation-spec";

function formatPrice(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

function StoresHomeHighRatingFoodCardInner({
  entry,
  imageUrl,
  loadingImage,
}: {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
}) {
  const href = `/stores/${encodeURIComponent(entry.storeSlug)}/p/${encodeURIComponent(entry.productId)}`;
  const warmMenus = () => {
    deliveryStoreMenusPrewarm(entry.storeSlug, { force: true });
  };

  return (
    <Link
      href={href}
      prefetch={false}
      data-stores-home-presentation="high_rating_horizontal"
      data-stores-home-high-rating-food-card="true"
      data-stores-home-presentation-avis={STORES_HOME_PRESENTATION_SPEC.patterns.highRatingHorizontal.avisSection}
      onPointerDown={warmMenus}
      onFocus={warmMenus}
      className={`flex w-[8.75rem] shrink-0 flex-col overflow-hidden ${STORES_HOME_CARD}`}
    >
      <div className="relative aspect-[4/3] w-full bg-[color:var(--delivery-bg-thumb)]">
        {loadingImage ?
          <div className="absolute inset-0 bg-[color:var(--delivery-bg-muted)]" aria-hidden />
        : imageUrl ?
          <StoreProductThumbnail
            src={imageUrl}
            alt={entry.name}
            fill
            fetchPreset="hubFood"
            className="absolute inset-0"
            imageClassName="h-full w-full object-cover"
            roundedClassName="rounded-none"
            loading="lazy"
          />
        : (
          <div className="flex h-full items-center justify-center text-[11px] text-[color:var(--delivery-text-muted)]">
            {entry.name.slice(0, 1)}
          </div>
        )}
        {entry.rating > 0 ?
          <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-[4px] bg-black/55 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
            ★ {entry.rating.toFixed(1)}
          </div>
        : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-[1.05] text-[color:var(--delivery-text-main)]">
          {entry.name}
        </p>
        <p className="text-[13px] font-semibold text-[color:var(--delivery-primary)]">{formatPrice(entry.price)}</p>
        <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.storeName}</p>
        {entry.etaLabel ?
          <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.etaLabel}</p>
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeHighRatingFoodCard = memo(StoresHomeHighRatingFoodCardInner);
