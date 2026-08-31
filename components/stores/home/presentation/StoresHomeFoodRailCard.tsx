"use client";

/**
 * HOME §3.6 Food / product horizontal card.
 */

import Link from "next/link";
import { memo, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { navigateToDeliveryStoreProduct } from "@/lib/navigation/navigate-to-delivery-store-product";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryAdCustomerAdTag } from "@/components/stores/advertising/DeliveryAdCustomerAdTag";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_BODY, STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import { STORES_HOME_PRESENTATION_SPEC } from "@/lib/stores/presentation/stores-home-presentation-spec";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

function formatPrice(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

export type StoresHomeFoodRailPresentation = "rail" | "grid";

function StoresHomeFoodRailCardInner({
  entry,
  imageUrl,
  loadingImage,
  markStoreCardPerf = false,
  presentation = "rail",
  benefit,
}: {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
  markStoreCardPerf?: boolean;
  presentation?: StoresHomeFoodRailPresentation;
  benefit?: StoresHomeShelfCardBenefit;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const href = `/stores/${encodeURIComponent(entry.storeSlug)}/p/${encodeURIComponent(entry.productId)}`;
  const widthClass = presentation === "grid" ? "w-full" : "w-[7.5rem] shrink-0";

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
      data-stores-home-presentation="food_horizontal"
      data-stores-home-food-rail-card="true"
      data-stores-home-presentation-avis={STORES_HOME_PRESENTATION_SPEC.patterns.foodHorizontal.avisSection}
      data-stores-perf={markStoreCardPerf ? "store-card" : undefined}
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
      className={`flex ${widthClass} flex-col overflow-hidden ${STORES_HOME_CARD}`}
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
        {benefit?.imageBadgeLabel ?
          <span
            className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${benefit.imageBadgeClassName ?? "bg-black/55 text-white"}`}
          >
            {benefit.imageBadgeLabel}
          </span>
        : null}
      </div>
      <div className="space-y-0.5 p-2">
        {entry.menuAuthority === "platform_popular" ?
          <p className={`line-clamp-1 font-medium text-[color:var(--delivery-primary)] ${STORES_HOME_META}`}>
            {t("store_badge_menu_popular")}
          </p>
        : null}
        {entry.campaignTitle ?
          <p className={`line-clamp-1 font-medium text-[color:var(--delivery-text)] ${STORES_HOME_META}`}>
            {entry.campaignTitle}
          </p>
        : null}
        <p className={`line-clamp-2 text-[13px] leading-[1.02] ${STORES_HOME_BODY}`}>{entry.name}</p>
        <p className={`text-[13px] font-semibold leading-[1.02] text-[color:var(--delivery-primary)]`}>
          {formatPrice(entry.price)}
        </p>
        <p className={`line-clamp-1 text-[12.5px] leading-[1.02] ${STORES_HOME_META}`}>{entry.storeName}</p>
        {benefit?.benefitLine ?
          <p className="line-clamp-2 text-[11.5px] font-medium leading-[1.02] text-signature">{benefit.benefitLine}</p>
        : null}
        {entry.etaLabel ?
          <p className={`line-clamp-1 text-[12.5px] leading-[1.02] ${STORES_HOME_META}`}>{entry.etaLabel}</p>
        : null}
        {entry.rating > 0 ?
          <p className={`line-clamp-1 text-[12.5px] leading-[1.02] ${STORES_HOME_META}`}>
            ★ {entry.rating.toFixed(1)}
          </p>
        : null}
        {entry.deliveryFeeLabel ?
          <p className={`line-clamp-1 text-[12.5px] leading-[1.02] ${STORES_HOME_META}`}>{entry.deliveryFeeLabel}</p>
        : null}
        {entry.discountEvidence === "delivery_fee_strike" &&
        entry.deliveryFeeStrikePhp != null &&
        entry.deliveryFeeStrikePhp > 0 ?
          <p className={`line-clamp-1 text-[12.5px] font-medium leading-[1.02] text-[color:var(--delivery-text-sub)]`}>
            {formatMoneyPhp(entry.deliveryFeeStrikePhp)}
          </p>
        : null}
        {benefit?.sponsored ?
          <DeliveryAdCustomerAdTag label={t("store_insertion_sponsored")} />
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeFoodRailCard = memo(StoresHomeFoodRailCardInner);
