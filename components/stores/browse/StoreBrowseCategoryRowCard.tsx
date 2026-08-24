"use client";

/**
 * CATEGORY LIST presentation owner — `/stores/browse/[primary]?sub=...`
 * A-VIS SSOT: menu band (4-up) → optional promo → identity → meta → badges.
 * Discovery/ranking/order unchanged; presentation only.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import { buildBrowseCategoryPromoLine } from "@/lib/stores/build-browse-category-promo-line";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import { STORES_BROWSE_CATEGORY_PRESENTATION } from "@/lib/stores/stores-browse-category-presentation-spec";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo } from "react";
import { StoreBrowseFeaturedMenuSkeleton } from "@/components/stores/browse/StoreBrowseFeaturedMenuSkeleton";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import {
  deliveryShellEntryBeginNavigation,
  deliveryShellEntryMark,
  deliveryShellEntryScheduleRouterPushStart,
} from "@/lib/dibay/delivery-shell-entry-trace";
import {
  buildStoreDetailHref,
  deliveryStoreDetailPrefetch,
  deliveryStoreDetailPrefetchForTap,
} from "@/lib/dibay/delivery-store-detail-prefetch";
import { armStoreMenuFocusEntryIntent } from "@/lib/dibay/store-menu-focus-entry-intent";
import { useDeliveryStoreDetailViewportPrefetch } from "@/lib/dibay/use-delivery-store-detail-viewport-prefetch";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { writeStoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import { commitStoreDetailBrowseOriginForEntry } from "@/lib/dibay/store-detail-browse-origin";
import { deliveryMenuVisibleBeginNavSession } from "@/lib/dibay/delivery-menu-visible-trace";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
import { useDeliverySurfaceLifecycle } from "@/components/delivery/presentation/DeliverySurfaceLifecycle";
import {
  DELIVERY_PERF_TAG_ROUTE_TRANSITION,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { formatMoneyPhp } from "@/lib/utils/format";
import { storeBrowseDeliveryFeeShowsFreeBadge } from "@/lib/stores/store-commerce-extras";
import { commerceExtrasFromBrowseSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import {
  storeRowCardDataEqual,
  type StoreRowCardData,
} from "@/components/stores/home/StoreDeliveryRowCard";

export type { StoreRowCardData };

export type StoreBrowseCampaignBenefit = {
  kind: "paid_ad" | "coupon";
  promoLine: string;
  sponsored?: boolean;
  onActivate?: () => void;
};

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function BrowseListStraightDistancePinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 42" width={13} height={17} aria-hidden>
      <path
        d="M16 38C8 24 4 20 4 14a12 12 0 1 1 24 0c0 6-4 10-12 24z"
        fill="#E53935"
        stroke="#B71C1C"
        strokeWidth="0.7"
      />
      <circle cx="16" cy="14" r="4.2" fill="white" />
    </svg>
  );
}

function priceLabel(php: number) {
  const safe = Number.isFinite(php) ? Math.max(0, Math.round(php)) : 0;
  return `₱${safe.toLocaleString("en-PH")}`;
}

const SPEC = STORES_BROWSE_CATEGORY_PRESENTATION;
/** SSOT @390 — band/tile heights in `delivery-components.css` (`.stores-category-menu-*`) */
const PROMO_BAR_H = "h-[31.2px]";
const MENU_TILE_RADIUS = "rounded-[2.9px]";

function StoreBrowseCategoryRowCardInner({
  data,
  locale,
  deliveryRideTimeSource = "google",
  featuredMenuHydration = "idle",
  browseStoreId,
  registerBrowseListItem,
  campaignBenefit,
}: {
  data: StoreRowCardData;
  locale: AppLanguageCode;
  deliveryRideTimeSource?: string;
  featuredMenuHydration?: BrowseFeaturedMenuHydrationPhase;
  browseStoreId?: string;
  registerBrowseListItem?: (storeId: string, node: HTMLElement | null) => void;
  campaignBenefit?: StoreBrowseCampaignBenefit;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const browseLifecycle = useDeliverySurfaceLifecycle("browse");
  const browseActive = browseLifecycle === "active";
  const viewportRef = useDeliveryStoreDetailViewportPrefetch(data.slug, browseActive);
  const setListItemRef = useCallback(
    (node: HTMLElement | null) => {
      viewportRef(node);
      const sid = browseStoreId ?? data.storeId;
      if (sid && registerBrowseListItem) {
        registerBrowseListItem(sid, node);
      }
    },
    [viewportRef, browseStoreId, data.storeId, registerBrowseListItem]
  );

  const prefetchStoreDetail = useCallback(
    (
      source: Parameters<typeof deliveryStoreDetailPrefetch>[2],
      opts?: { force?: boolean; focusProductId?: string | null }
    ) => {
      if (!browseActive) return;
      deliveryStoreDetailPrefetch(router, data.slug, source, opts);
    },
    [browseActive, router, data.slug]
  );

  const warmFeaturedMenuNavigation = useCallback(
    (productId: string, source: "pointer_enter" | "pointer_down" | "touch_start") => {
      if (!browseActive) return;
      deliveryStoreDetailPrewarmAll(data.slug, { force: true });
      prefetchStoreDetail(source, { force: true, focusProductId: productId });
    },
    [browseActive, data.slug, prefetchStoreDetail]
  );

  const d = distLabel(data.distanceKm);
  const showBrowseStraightPin = data.showStraightLineMapPin === true && !!d;
  const showPinHaversine = !showBrowseStraightPin && d;
  const distanceOutOfRangeLabel =
    data.distanceOutOfRange && data.maxDeliveryDistanceKm != null
      ? t("store_delivery_distance_out_of_range_with_max", { km: data.maxDeliveryDistanceKm })
      : data.distanceOutOfRange
        ? t("store_delivery_distance_out_of_range")
        : null;

  const rowLabels = useMemo(() => {
    if (!data.commerce) return null;
    return formatBrowseStoreRowLabels(locale, data.commerce, {
      deliveryAvailable: data.deliveryAvailable,
      rideMinutes: data.rideMinutes ?? null,
      routeContextPresent:
        data.straightDistanceKm != null ||
        data.distanceKm != null ||
        data.routeDistanceKm != null,
      deliveryRideTimeSource,
    });
  }, [
    locale,
    data.commerce,
    data.deliveryAvailable,
    data.rideMinutes,
    data.straightDistanceKm,
    data.distanceKm,
    data.routeDistanceKm,
    deliveryRideTimeSource,
  ]);

  const deliveryFeeUi = rowLabels?.deliveryFeeLabel ?? null;
  const deliveryFeeStrikePhp = rowLabels?.deliveryFeeStrikePhp ?? data.deliveryFeeStrikePhp;
  const timeLabel = rowLabels?.etaLabel?.trim() || null;
  const minOrderLine = rowLabels?.minOrderLabel ?? null;
  const minOrderShort =
    minOrderLine?.includes(":") ? (minOrderLine.split(":").pop()?.trim() ?? null) : null;

  const commerceExtras = data.commerce ? commerceExtrasFromBrowseSnapshot(data.commerce) : null;
  const freeDeliveryProven =
    data.deliveryAvailable &&
    commerceExtras != null &&
    storeBrowseDeliveryFeeShowsFreeBadge(commerceExtras);

  const promoLine = useMemo(() => {
    if (campaignBenefit?.promoLine?.trim()) return campaignBenefit.promoLine.trim();
    return buildBrowseCategoryPromoLine(locale, data.commerce, rowLabels, {
      deliveryAvailable: data.deliveryAvailable,
    });
  }, [campaignBenefit?.promoLine, locale, data.commerce, rowLabels, data.deliveryAvailable]);

  const statusBadge =
    data.status === "open"
      ? { label: t("store_open_now"), className: "bg-sam-success-soft text-sam-success" }
      : data.status === "resting"
        ? { label: t("store_resting_now"), className: "bg-sam-warning-soft text-sam-warning" }
        : data.status === "closed"
          ? { label: t("store_closed_now"), className: "bg-sam-surface-muted text-sam-muted" }
          : { label: t("store_preparing"), className: "bg-sam-warning-soft text-sam-warning" };

  const badgeLabels = resolveStoreListCardBadges({
    statusLabel: statusBadge.label,
    statusClassName: statusBadge.className,
    isFeatured: data.isFeatured,
    recommendedLabel: t("store_badge_recommended"),
    pickupAvailable: data.pickupAvailable,
    pickupLabel: t("store_pickup_available"),
    freeDeliveryProven,
    freeDeliveryLabel: t("store_free_delivery_short"),
    outOfRangeLabel: distanceOutOfRangeLabel,
  });

  const featuredMenuImages = data.featuredItems
    .filter((x) => typeof x.imageUrl === "string" && x.imageUrl.trim().length > 0)
    .slice(0, SPEC.menuTileVisibleCount);

  const showFeaturedMenuSkeleton =
    featuredMenuHydration === "loading" && featuredMenuImages.length === 0;

  const navigateToStore = useCallback(
    (source: "card" | "featured_menu" | "see_more", focusProductId?: string) => {
      const href = buildStoreDetailHref(data.slug, focusProductId);
      if (focusProductId) armStoreMenuFocusEntryIntent(focusProductId);
      saveDeliveryListScrollBeforeStoreNavigation();
      if (typeof window !== "undefined") {
        commitStoreDetailBrowseOriginForEntry(
          data.slug,
          window.location.pathname,
          window.location.search,
        );
      }
      writeStoreDetailListSeed({
        slug: data.slug,
        store_name: data.nameKo,
        hero_image_url: data.heroBannerImageUrl,
        rating_avg: data.rating,
        review_count: data.reviewCount,
        delivery_available: data.deliveryAvailable,
        pickup_available: data.pickupAvailable,
        tagline: data.tagline,
        region_badge: data.regionBadge,
      });
      deliveryStoreDetailPrewarmAll(data.slug, { force: true });
      deliveryShellEntryBeginNavigation(data.slug);
      deliveryShellEntryScheduleRouterPushStart(data.slug, href);
      router.push(href, { scroll: false });
      const prefetch = deliveryStoreDetailPrefetchForTap(router, data.slug, href);
      markStoreDetailListSeedNavigation(data.slug);
      dibayPerfRecordStoreCardNavigationIntent(data.slug);
      deliveryMenuVisibleBeginNavSession(data.slug);
      deliveryShellEntryMark("card_tap", {
        slug: data.slug,
        prefetch_age_ms: prefetch.age_ms,
        was_prefetched_request: prefetch.was_prefetched_request,
        was_prefetch_ready: prefetch.was_prefetch_ready,
        was_prefetch_inflight: prefetch.was_prefetch_inflight,
        prefetch_request_age_ms: prefetch.prefetch_request_age_ms,
        prefetch_ready_age_ms: prefetch.prefetch_ready_age_ms,
        prefetch_duration_ms: prefetch.prefetch_duration_ms,
        seed_saved: true,
        ...(focusProductId ? { focus_product_id: focusProductId, tap_surface: source } : { tap_surface: source }),
      });
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
        event: source === "featured_menu" ? "store_featured_menu_tap" : "store_card_tap",
        slug: data.slug,
        ...(focusProductId ? { product_id: focusProductId } : {}),
      });
    },
    [data, router]
  );

  const onRowPointerWarm = useCallback(() => {
    deliveryStoreDetailPrewarmAll(data.slug);
    prefetchStoreDetail("pointer_enter");
  }, [data.slug, prefetchStoreDetail]);

  const menuTiles = featuredMenuImages.length > 0 ? featuredMenuImages : [];
  const emptyTileSlots = Math.max(0, SPEC.menuTileVisibleCount - menuTiles.length);

  return (
    <li
      ref={setListItemRef}
      className="list-none select-none border-b border-[var(--delivery-border-light)] bg-[var(--delivery-bg-card)] py-2"
      data-stores-category-row="true"
      data-stores-category-presentation-owner="StoreBrowseCategoryRowCard"
      onPointerEnter={onRowPointerWarm}
      onFocus={onRowPointerWarm}
    >
      <div className="flex flex-col">
        <div
          className="stores-category-menu-band grid w-full grid-cols-4 gap-[0.5px]"
          data-stores-category-menu-band="true"
          style={{ height: `${SPEC.menuBandHeightPx}px` }}
          aria-label={t("store_featured_menu_image_aria")}
        >
          {showFeaturedMenuSkeleton ?
            <StoreBrowseFeaturedMenuSkeleton variant="category" />
          : menuTiles.length > 0 ?
            <>
              {menuTiles.map((item) => {
                const price = priceLabel(item.price);
                return (
                  <button
                    key={item.productId}
                    type="button"
                    aria-label={t("store_row_menu_view_aria", { store: data.nameKo, item: item.name })}
                    className={[
                      "stores-category-menu-tile relative overflow-hidden text-left",
                      MENU_TILE_RADIUS,
                      "bg-[color:var(--delivery-bg-muted)]",
                      "transition-[transform,opacity] duration-120 active:scale-[0.98] active:opacity-90",
                    ].join(" ")}
                    style={{ height: `${SPEC.menuTileHeightPx}px` }}
                    onPointerEnter={() => warmFeaturedMenuNavigation(item.productId, "pointer_enter")}
                    onPointerDown={() => warmFeaturedMenuNavigation(item.productId, "pointer_down")}
                    onTouchStart={() => warmFeaturedMenuNavigation(item.productId, "touch_start")}
                    onClick={() => navigateToStore("featured_menu", item.productId)}
                  >
                    <StoreProductThumbnail
                      src={(item.imageUrl as string) || ""}
                      fill
                      fetchPreset="rowFeatured"
                      roundedClassName={MENU_TILE_RADIUS}
                      className="h-full w-full"
                      loading="lazy"
                    />
                    {price ?
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-1.5 pb-1 pt-6">
                        <p className="line-clamp-1 text-[11px] font-semibold leading-snug text-white">
                          {item.name}
                        </p>
                        <p className="line-clamp-1 text-[11.5px] font-bold leading-snug text-white">{price}</p>
                      </div>
                    : null}
                  </button>
                );
              })}
              {emptyTileSlots > 0 ?
                Array.from({ length: emptyTileSlots }, (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className={`stores-category-menu-tile ${MENU_TILE_RADIUS} bg-[color:var(--delivery-bg-muted)]`}
                    style={{ height: `${SPEC.menuTileHeightPx}px` }}
                    aria-hidden
                  />
                ))
              : null}
            </>
          : (
            <button
              type="button"
              className={`stores-category-menu-band col-span-4 flex w-full items-center justify-center ${MENU_TILE_RADIUS} bg-[color:var(--delivery-bg-muted)]`}
              aria-label={t("store_row_store_more_aria", { store: data.nameKo })}
              onClick={() => navigateToStore("see_more")}
            >
              <span className="text-[13px] font-semibold text-[color:var(--delivery-text-muted)]">
                {t("store_show_more")}
              </span>
            </button>
          )}
        </div>

        {promoLine ?
          <div
            className={`flex w-full ${PROMO_BAR_H} items-center px-[10px] text-[12.5px] font-semibold leading-tight text-white ${
              campaignBenefit ? "bg-signature" : "text-sam-fg bg-sam-warning-soft"
            }`}
            data-stores-category-promo-bar="true"
          >
            <span className="line-clamp-2">{promoLine}</span>
          </div>
        : null}

        <button
          type="button"
          className="block w-full px-[10px] pt-2 text-left transition-[transform,opacity] duration-120 active:scale-[0.985] active:opacity-95"
          onPointerDown={() => {
            deliveryStoreDetailPrewarmAll(data.slug);
            prefetchStoreDetail("pointer_down", { force: true });
          }}
          onTouchStart={() => {
            deliveryStoreDetailPrewarmAll(data.slug);
            prefetchStoreDetail("touch_start", { force: true });
          }}
          onClick={() => navigateToStore("card")}
        >
          <h3
            className="delivery-store-row__title line-clamp-1 text-[14.5px] leading-[1.05] tracking-[-0.01em]"
            data-stores-category-identity="true"
          >
            {data.nameKo}
            <span className={`ml-2 inline-flex items-center gap-1 align-middle text-[14px] font-bold ${FB.ratingValue}`}>
              <span className={`text-[12.5px] ${FB.ratingStar}`} aria-hidden>
                ★
              </span>
              {data.rating.toFixed(1)}
              <span className={FB.ratingCount}>({reviewLabel(data.reviewCount)})</span>
            </span>
          </h3>

          <div
            className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 overflow-hidden text-[12.5px] leading-[1.02] ${FB.metaRow}`}
            data-stores-category-metadata="true"
          >
            {campaignBenefit?.sponsored ?
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                {t("store_insertion_sponsored")}
              </span>
            : null}
            {campaignBenefit?.sponsored && timeLabel ?
              <span className={FB.metaDot}>·</span>
            : null}
            {timeLabel ?
              <span className={`inline-flex shrink-0 items-center gap-1 ${FB.metaStrong}`}>
                <svg className="h-3.5 w-3.5 opacity-75" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 8v5l3 2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="truncate">{timeLabel}</span>
              </span>
            : null}
            {timeLabel && (deliveryFeeUi || showBrowseStraightPin || showPinHaversine) ?
              <span className={FB.metaDot}>·</span>
            : null}
            {data.deliveryAvailable && deliveryFeeUi ?
              <span className={`inline-flex shrink-0 items-center gap-1 ${FB.metaStrong}`}>
                {deliveryFeeUi === t("store_free_delivery_applied") ?
                  <span className={FB.freeDelivery}>{deliveryFeeUi}</span>
                : <span className="font-semibold">{deliveryFeeUi}</span>}
                {deliveryFeeStrikePhp != null && deliveryFeeStrikePhp > 0 ?
                  <span className={FB.strike}>{formatMoneyPhp(deliveryFeeStrikePhp)}</span>
                : null}
              </span>
            : !data.deliveryAvailable ?
              <span className={FB.metaStrong}>{t("store_delivery_no_short")}</span>
            : null}
            {(timeLabel || deliveryFeeUi || !data.deliveryAvailable) &&
            (showBrowseStraightPin || showPinHaversine) ?
              <span className={FB.metaDot}>·</span>
            : null}
            {showBrowseStraightPin ?
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 ${FB.metaStrong}`}
                title={t("store_straight_distance_title")}
              >
                <BrowseListStraightDistancePinIcon className="shrink-0" />
                <span>{d}</span>
              </span>
            : showPinHaversine ?
              <span
                className="inline-flex shrink-0 items-center gap-1 font-medium"
                title={t("store_straight_distance_title")}
              >
                <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {d}
              </span>
            : null}
            {(timeLabel || deliveryFeeUi || showBrowseStraightPin || showPinHaversine) && minOrderShort ?
              <span className={FB.metaDot}>·</span>
            : null}
            {minOrderShort ?
              <span className="min-w-0 truncate font-normal">
                {t("store_min_order_short")}{" "}
                <span className={FB.metaStrong}>{minOrderShort}</span>
              </span>
            : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-stores-category-badges="true">
            {badgeLabels.map((b) => (
              <span
                key={`${b.kind}-${b.label}`}
                className={`inline-flex h-[21px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </button>
      </div>
    </li>
  );
}

export const StoreBrowseCategoryRowCard = memo(
  StoreBrowseCategoryRowCardInner,
  (prev, next) =>
    prev.locale === next.locale &&
    prev.deliveryRideTimeSource === next.deliveryRideTimeSource &&
    prev.featuredMenuHydration === next.featuredMenuHydration &&
    prev.browseStoreId === next.browseStoreId &&
    prev.registerBrowseListItem === next.registerBrowseListItem &&
    storeRowCardDataEqual(prev.data, next.data)
);

StoreBrowseCategoryRowCard.displayName = "StoreBrowseCategoryRowCard";

export {
  browseItemToRowCard,
  homeFeedToRowCard,
} from "@/components/stores/home/StoreDeliveryRowCard";
