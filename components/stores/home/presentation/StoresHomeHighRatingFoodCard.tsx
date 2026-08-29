"use client";

/**
 * HOME §3.5 High-rating horizontal food card — larger image, rating emphasis.
 * OBSERVED anatomy partial; exact overlay geometry NOT_PROVEN.
 */

import Link from "next/link";
import { memo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { navigateToDeliveryStoreProduct } from "@/lib/navigation/navigate-to-delivery-store-product";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import { STORES_HOME_PRESENTATION_SPEC } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

function formatPrice(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

function StoresHomeHighRatingFoodCardInner({
  entry,
  imageUrl,
  loadingImage,
  benefit,
}: {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
  benefit?: StoresHomeShelfCardBenefit;
}) {
  const { t } = useI18n();
  const router = useRouter();
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
      onClick={(e) => {
        e.preventDefault();
        warmMenus();
        navigateToDeliveryStoreProduct(router, {
          storeSlug: entry.storeSlug,
          productId: entry.productId,
          childMode: "productPage",
        });
      }}
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
        {benefit?.imageBadgeLabel ?
          <span
            className={`pointer-events-none absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${benefit.imageBadgeClassName ?? "bg-black/55 text-white"}`}
          >
            {benefit.imageBadgeLabel}
          </span>
        : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-[1.05] text-[color:var(--delivery-text-main)]">
          {entry.name}
        </p>
        <p className="text-[13px] font-semibold text-[color:var(--delivery-primary)]">{formatPrice(entry.price)}</p>
        <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.storeName}</p>
        {benefit?.benefitLine ?
          <p className="line-clamp-2 text-[11.5px] font-medium text-signature">{benefit.benefitLine}</p>
        : entry.etaLabel ?
          <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.etaLabel}</p>
        : null}
        {benefit?.sponsored ?
          <p className="text-[10px] font-medium text-amber-700">{t("store_insertion_sponsored")}</p>
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeHighRatingFoodCard = memo(StoresHomeHighRatingFoodCardInner);
