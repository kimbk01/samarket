"use client";

import Link from "next/link";
import { memo, useLayoutEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_BODY, STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";

function formatPrice(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

function StoresHomeFoodCardInner({
  entry,
  imageUrl,
  loadingImage,
  markStoreCardPerf = false,
}: {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
  /** perf 마커만 — LCP 경쟁 없음(항상 lazy) */
  markStoreCardPerf?: boolean;
}) {
  const { t } = useI18n();
  const href = `/stores/${encodeURIComponent(entry.storeSlug)}/p/${encodeURIComponent(entry.productId)}`;

  useLayoutEffect(() => {
    if (markStoreCardPerf) markStoresHomePerf("store-card");
  }, [markStoreCardPerf]);

  const warmMenus = () => {
    deliveryStoreMenusPrewarm(entry.storeSlug, { force: true });
  };

  return (
    <Link
      href={href}
      prefetch={false}
      data-stores-perf={markStoreCardPerf ? "store-card" : undefined}
      onPointerDown={warmMenus}
      onFocus={warmMenus}
      className={`flex w-[7.5rem] shrink-0 flex-col overflow-hidden ${STORES_HOME_CARD}`}
    >
      <div className="relative aspect-square w-full bg-[color:var(--delivery-bg-thumb)]">
        {loadingImage ?
          <div
            className="absolute inset-0 bg-[color:var(--delivery-bg-muted)]"
            aria-hidden
            data-stores-home-food-image-pending="true"
          />
        : imageUrl ?
          <StoreProductThumbnail
            src={imageUrl}
            alt={entry.name}
            fill
            fetchPreset="hubFood"
            className="absolute inset-0"
            imageClassName="h-full w-full object-cover"
            roundedClassName="rounded-none"
            loading={markStoreCardPerf ? "eager" : "lazy"}
            priority={markStoreCardPerf && Boolean(imageUrl)}
          />
        : (
          <div className="flex h-full items-center justify-center text-[11px] text-[color:var(--delivery-text-muted)]">
            {entry.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="space-y-0.5 p-2">
        <p className={`line-clamp-2 ${STORES_HOME_BODY}`}>{entry.name}</p>
        <p className={`font-semibold text-[color:var(--delivery-primary)] ${STORES_HOME_BODY}`}>
          {formatPrice(entry.price)}
        </p>
        <p className={`line-clamp-1 ${STORES_HOME_META}`}>{entry.storeName}</p>
        {entry.discountEvidence === "delivery_fee_strike" &&
        entry.deliveryFeeStrikePhp != null &&
        entry.deliveryFeeStrikePhp > 0 ?
          <p className={`line-clamp-1 font-medium text-[color:var(--delivery-primary)] ${STORES_HOME_META}`}>
            {t("store_badge_instant_discount")}
          </p>
        : entry.campaignTitle ?
          <p className={`line-clamp-1 font-medium text-[color:var(--delivery-text)] ${STORES_HOME_META}`}>
            {entry.campaignTitle}
          </p>
        : entry.menuAuthority === "platform_popular" ?
          <p className={`line-clamp-1 font-medium text-[color:var(--delivery-primary)] ${STORES_HOME_META}`}>
            {t("store_badge_menu_popular")}
          </p>
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeFoodCard = memo(StoresHomeFoodCardInner);

export function resolveFoodCardImage(
  entry: StoresHomeFoodEntry,
  hydrated: BrowseFeaturedCardItem[] | undefined
): { imageUrl: string | null; loading: boolean } {
  if (entry.imageUrl) return { imageUrl: entry.imageUrl, loading: false };
  if (hydrated === undefined) return { imageUrl: null, loading: true };
  const hit = hydrated.find((x) => x.productId === entry.productId);
  if (hit?.imageUrl) return { imageUrl: hit.imageUrl, loading: false };
  const fallback = hydrated.find((x) => x.imageUrl)?.imageUrl ?? null;
  return { imageUrl: fallback, loading: false };
}
