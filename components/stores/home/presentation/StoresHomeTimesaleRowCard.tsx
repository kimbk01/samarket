"use client";

/**
 * HOME §3.1 Timesale vertical row — left thumb + meta column.
 * NOT CATEGORY menu band · NOT browse 116px strip.
 */

import Link from "next/link";
import { Fragment, memo, useCallback, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import { STORES_HOME_PRESENTATION_SPEC } from "@/lib/stores/presentation/stores-home-presentation-spec";
import { storeBrowseDeliveryFeeShowsFreeBadge } from "@/lib/stores/store-commerce-extras";
import { commerceExtrasFromBrowseSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { writeStoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import {
  orderHomeRestStoresForPaidInsertion,
  resolveHomeShelfCardBenefit,
  type StoresHomeInsertionBenefitMaps,
} from "@/lib/stores/product/stores-home-shelf-card-benefit";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import { resolveHomeShelfStoreImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type {
  StoresHomeShelfBadgeMode,
  StoresHomeShelfBenefitLineMode,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { DeliveryAdSponsoredBeacon } from "@/components/stores/advertising/DeliveryAdSponsoredBeacon";

const TIMESALE_SPEC = STORES_HOME_PRESENTATION_SPEC.patterns.timesaleVertical;

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function StoresHomeTimesaleRowCardInner({
  store,
  locale,
  registerListItem,
  imageUrl: imageUrlOverride,
  benefit,
}: {
  store: StoreHomeFeedItem;
  locale: AppLanguageCode;
  registerListItem?: (storeId: string, node: HTMLElement | null) => void;
  featuredMenuHydration?: BrowseFeaturedMenuHydrationPhase;
  imageUrl?: string | null;
  benefit?: StoresHomeShelfCardBenefit;
}) {
  const { t } = useI18n();
  const href = `/stores/${encodeURIComponent(store.slug)}`;

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      registerListItem?.(store.id, node);
    },
    [registerListItem, store.id]
  );

  const rowLabels = useMemo(() => {
    if (!store.commerce) return null;
    return formatBrowseStoreRowLabels(locale, store.commerce, {
      deliveryAvailable: store.deliveryAvailable,
      rideMinutes: store.rideMinutes ?? null,
      routeContextPresent: store.distanceKm != null || store.straightDistanceKm != null,
      deliveryRideTimeSource: "google",
    });
  }, [locale, store.commerce, store.deliveryAvailable, store.rideMinutes, store.distanceKm, store.straightDistanceKm]);

  const deliveryFeeUi = rowLabels?.deliveryFeeLabel ?? store.deliveryFeeLabel;
  const deliveryFeeStrikePhp = rowLabels?.deliveryFeeStrikePhp ?? store.deliveryFeeStrikePhp;
  const timeLabel = rowLabels?.etaLabel?.trim() || store.etaLabel?.trim() || null;
  const minOrderLine = rowLabels?.minOrderLabel ?? store.minOrderLabel;
  const minOrderShort =
    minOrderLine?.includes(":") ? (minOrderLine.split(":").pop()?.trim() ?? null) : minOrderLine;

  const commerceExtras = store.commerce ? commerceExtrasFromBrowseSnapshot(store.commerce) : null;
  const freeDeliveryProven =
    store.deliveryAvailable &&
    commerceExtras != null &&
    storeBrowseDeliveryFeeShowsFreeBadge(commerceExtras);

  const statusBadge =
    store.status === "open"
      ? { label: t("store_open_now"), className: "bg-sam-success-soft text-sam-success" }
      : store.status === "preparing"
        ? { label: t("store_preparing"), className: "bg-sam-warning-soft text-sam-warning" }
        : { label: t("store_closed_now"), className: "bg-sam-surface-muted text-sam-muted" };

  const badgeLabels = resolveStoreListCardBadges({
    statusLabel: statusBadge.label,
    statusClassName: statusBadge.className,
    isFeatured: store.isFeatured,
    recommendedLabel: t("store_badge_recommended"),
    pickupAvailable: store.pickupAvailable,
    pickupLabel: t("store_pickup_available"),
    freeDeliveryProven,
    freeDeliveryLabel: t("store_free_delivery_short"),
    outOfRangeLabel:
      store.distanceOutOfRange && store.maxDeliveryDistanceKm != null
        ? t("store_delivery_distance_out_of_range_with_max", { km: store.maxDeliveryDistanceKm })
        : store.distanceOutOfRange
          ? t("store_delivery_distance_out_of_range")
          : null,
  });

  const thumbUrl =
    imageUrlOverride?.trim() ||
    store.profileImageUrl?.trim() ||
    store.featuredItems.find((x) => x.imageUrl?.trim())?.imageUrl?.trim() ||
    null;

  const d = distLabel(store.distanceKm);

  const warm = () => {
    deliveryStoreMenusPrewarm(store.slug, { force: true });
  };

  return (
    <li
      ref={setRef}
      className="list-none border-b border-[var(--delivery-border-light)] bg-[var(--delivery-bg-card)] py-2.5"
      data-stores-home-presentation="timesale_vertical"
      data-stores-home-timesale-row="true"
      data-stores-home-presentation-avis={STORES_HOME_PRESENTATION_SPEC.patterns.timesaleVertical.avisSection}
    >
      <Link
        href={href}
        prefetch={false}
        className="flex items-start gap-2.5 px-[10px] transition-[transform,opacity] duration-120 active:scale-[0.985] active:opacity-95"
        onPointerDown={warm}
        onFocus={warm}
        onClick={() => {
          saveDeliveryListScrollBeforeStoreNavigation();
          markStoreDetailListSeedNavigation(store.slug);
          writeStoreDetailListSeed({
            slug: store.slug,
            store_name: store.nameKo,
            hero_image_url: null,
            rating_avg: store.rating,
            review_count: store.reviewCount,
            delivery_available: store.deliveryAvailable,
            pickup_available: store.pickupAvailable,
            tagline: store.tagline,
            region_badge: store.regionLabel?.trim() || null,
          });
          dibayPerfRecordStoreCardNavigationIntent(store.slug);
        }}
      >
        <div
          className="stores-home-timesale-thumb relative shrink-0 overflow-hidden rounded-[6px] bg-[color:var(--delivery-bg-thumb)]"
          data-stores-home-timesale-thumb="true"
          style={{
            width: `${TIMESALE_SPEC.thumbWidthPx}px`,
            height: `${TIMESALE_SPEC.thumbHeightPx}px`,
          }}
        >
          {thumbUrl ?
            <StoreProductThumbnail
              src={thumbUrl}
              alt={store.nameKo}
              fill
              fetchPreset="rowFeatured"
              roundedClassName="rounded-[6px]"
              className="h-full w-full"
              loading="lazy"
            />
          : (
            <div className="flex h-full w-full items-center justify-center text-[15px] font-bold text-[color:var(--delivery-text-muted)]">
              {store.nameKo.slice(0, 1)}
            </div>
          )}
          {benefit?.imageBadgeLabel ?
            <span
              className={`pointer-events-none absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${benefit.imageBadgeClassName ?? "bg-black/55 text-white"}`}
            >
              {benefit.imageBadgeLabel}
            </span>
          : null}
        </div>

        <div className="min-w-0 flex-1" data-stores-home-timesale-meta="true">
          <h3 className="line-clamp-1 text-[14.5px] font-semibold leading-[1.05] tracking-[-0.01em] text-[color:var(--delivery-text-main)]">
            {store.nameKo}
            <span className={`ml-1.5 inline-flex items-center gap-0.5 text-[13px] font-bold ${FB.ratingValue}`}>
              <span className={FB.ratingStar} aria-hidden>
                ★
              </span>
              {store.rating.toFixed(1)}
              <span className={`font-normal ${FB.ratingCount}`}>({reviewLabel(store.reviewCount)})</span>
            </span>
          </h3>

          {benefit?.benefitLine ?
            <p className="mt-1 line-clamp-1 text-[12.5px] font-medium leading-[1.02] text-signature">
              {benefit.benefitLine}
            </p>
          : null}

          <p className={`mt-1 line-clamp-1 text-[12.5px] leading-[1.02] ${FB.metaRow}`}>
            {!store.deliveryAvailable ?
              t("store_delivery_no_short")
            : deliveryFeeUi ?
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className={FB.metaStrong}>{deliveryFeeUi}</span>
                {deliveryFeeStrikePhp != null && deliveryFeeStrikePhp > 0 ?
                  <span className={FB.strike}>{formatMoneyPhp(deliveryFeeStrikePhp)}</span>
                : null}
              </span>
            : null}
          </p>

          <div className={`mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[12.5px] ${FB.metaRow}`}>
            {timeLabel ?
              <span className={FB.metaStrong}>{timeLabel}</span>
            : null}
            {timeLabel && d ? <span className={FB.metaDot}>·</span> : null}
            {d ? <span className={FB.metaStrong}>{d}</span> : null}
            {(timeLabel || d) && minOrderShort ? <span className={FB.metaDot}>·</span> : null}
            {minOrderShort ?
              <span className="truncate">
                {t("store_min_order_short")} <span className={FB.metaStrong}>{minOrderShort}</span>
              </span>
            : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {benefit?.sponsored ?
              <span className="inline-flex h-[19px] items-center rounded-[5px] bg-amber-100 px-1.5 text-[10px] font-semibold leading-none text-amber-800">
                {t("store_insertion_sponsored")}
              </span>
            : null}
            {badgeLabels.map((b) => (
              <span
                key={`${b.kind}-${b.label}`}
                className={`inline-flex h-[19px] items-center rounded-[5px] px-1.5 text-[10px] font-semibold leading-none ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </li>
  );
}

export const StoresHomeTimesaleRowCard = memo(
  StoresHomeTimesaleRowCardInner,
  (a, b) =>
    a.store.id === b.store.id &&
    a.locale === b.locale &&
    a.store === b.store &&
    a.imageUrl === b.imageUrl &&
    a.benefit === b.benefit
);

StoresHomeTimesaleRowCard.displayName = "StoresHomeTimesaleRowCard";

export function StoresHomeTimesaleRowCardList({
  stores,
  locale,
  registerListItem,
  imageSource = "auto",
  benefitMaps,
  benefitLabels,
  couponIntegration = "off",
  adIntegration = "off",
  badgeMode = "standard",
  benefitLineMode = "auto",
  homeInsertions,
}: {
  stores: StoreHomeFeedItem[];
  locale: AppLanguageCode;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  imageSource?: StoresHomeShelfImageSource;
  benefitMaps?: StoresHomeInsertionBenefitMaps;
  benefitLabels?: Parameters<typeof resolveHomeShelfCardBenefit>[0]["labels"];
  couponIntegration?: StoresHomeShelfCouponIntegration;
  adIntegration?: StoresHomeShelfAdIntegration;
  badgeMode?: StoresHomeShelfBadgeMode;
  benefitLineMode?: StoresHomeShelfBenefitLineMode;
  /** CUT 4 — rest_stores paid insertion order + sponsored flag */
  homeInsertions?: StoresHomeInsertionMeta;
}) {
  const emptyMaps: StoresHomeInsertionBenefitMaps = {
    adsByStoreId: new Map(),
    couponsByStoreId: new Map(),
  };
  const maps = benefitMaps ?? emptyMaps;
  const labels = benefitLabels ?? {
    sponsored: "Sponsored",
    coupon: "Coupon",
    couponDiscount: (d: string) => d,
    couponMinOrder: (a: string) => a,
    adHeadline: (h: string) => h,
  };

  const ordered = orderHomeRestStoresForPaidInsertion(stores, homeInsertions);

  return (
    <ul className="space-y-0">
      {ordered.map(({ store: s, isSponsored, campaignId, exposureToken }) => {
        const benefitBase = resolveHomeShelfCardBenefit({
          storeId: s.id,
          couponIntegration,
          /** Surface permission only; sponsored comes from insertion row. */
          adIntegration: isSponsored ? "sponsored_badge" : "off",
          badgeMode: isSponsored ? "sponsored" : badgeMode,
          benefitLineMode,
          maps: isSponsored
            ? {
                ...maps,
                adsByStoreId: new Map([
                  [
                    s.id,
                    {
                      id: campaignId ?? `sponsored-${s.id}`,
                      storeId: s.id,
                      title: "",
                      headline: "",
                      bodyCopy: null,
                      imageUrl: null,
                      placement: "stores_home",
                    },
                  ],
                ]),
              }
            : maps,
          labels,
        });
        const benefit =
          isSponsored && benefitBase
            ? { ...benefitBase, sponsored: true }
            : isSponsored
              ? {
                  imageBadgeLabel: labels.sponsored,
                  imageBadgeClassName: "bg-amber-500/90 text-white",
                  benefitLine: null,
                  sponsored: true,
                }
              : benefitBase;
        const card = (
          <StoresHomeTimesaleRowCard
            store={s}
            locale={locale}
            registerListItem={registerListItem}
            imageUrl={resolveHomeShelfStoreImage(s, imageSource)}
            benefit={benefit}
          />
        );
        /** P0-A — mount existing CUT G beacon when API meta already issued a token. */
        if (isSponsored && campaignId && exposureToken) {
          return (
            <DeliveryAdSponsoredBeacon
              key={`ad-${campaignId}`}
              campaignId={campaignId}
              exposureToken={exposureToken}
            >
              {card}
            </DeliveryAdSponsoredBeacon>
          );
        }
        return (
          <Fragment key={s.id}>{card}</Fragment>
        );
      })}
    </ul>
  );
}
