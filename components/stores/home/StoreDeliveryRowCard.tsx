"use client";

/** CONTRACT — browse 목록: `GET /api/stores/browse` 인라인 `featuredItems.imageUrl`(서버 URL 정규화). */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { BrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { browseCommerceSnapshotEqual } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";

import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo } from "react";
import { StoreBrowseFeaturedMenuSkeleton } from "@/components/stores/browse/StoreBrowseFeaturedMenuSkeleton";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { STORES_HOME_MENU_TILE, STORES_HOME_MENU_TILE_MORE } from "@/lib/stores/stores-home-ui";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import { BROWSE_FEATURED_ITEMS_PER_STORE_MAX } from "@/lib/stores/browse-featured-items-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
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
import {
  parseBrowsePrimarySlugFromPathname,
  writeStoreDetailBrowseOrigin,
  parseBrowseSubSlugFromSearch,
} from "@/lib/dibay/store-detail-browse-origin";
import { deliveryMenuVisibleBeginNavSession } from "@/lib/dibay/delivery-menu-visible-trace";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";
import { useDeliverySurfaceLifecycle } from "@/components/delivery/presentation/DeliverySurfaceLifecycle";
import {
  DELIVERY_PERF_TAG_ROUTE_TRANSITION,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import { STORES_LIST_PRESENTATION_SSOT } from "@/lib/stores/presentation/stores-list-presentation-ssot";

type StoreFeaturedCardItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

type PlatformPopularRowProduct = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  totalQty: number;
  popularRank: number;
  windowDays: number;
};

export type StoreRowCardData = {
  storeId?: string;
  slug: string;
  nameKo: string;
  tagline: string | null;
  categoryLine: string | null;
  regionBadge: string | null;
  status: "open" | "preparing" | "closed" | "resting";
  rating: number;
  reviewCount: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  reservationAvailable: boolean;
  minOrderLabel: string | null;
  estPrepLabel: string;
  /** 목록·피드 API가 채운 합산 ETA (`약 …`) — 없으면 estPrepLabel 기반 표시 */
  etaLabel?: string | null;
  deliveryFeeLabel: string | null;
  /** self_free_promo: 취소선 금액(페소) */
  deliveryFeeStrikePhp: number | null;
  /** `payment_methods`·`payment_methods_config` 기반 결제 안내 한 줄 */
  paymentMethodsLine: string;
  /** 표시 거리(km) — 경로 거리 우선, 실패 시 직선거리 */
  distanceKm: number | null;
  routeDistanceKm?: number | null;
  straightDistanceKm?: number | null;
  distancePolicyApplied?: boolean;
  distanceOutOfRange?: boolean;
  distanceSource?: "straight" | "google" | null;
  maxDeliveryDistanceKm?: number | null;
  /** Routes 실패로 직선거리 fallback 일 때만 빨간 핀으로 표시 */
  showStraightLineMapPin?: boolean;
  menuPreview: string | null;
  profileImageUrl: string | null;
  /** 상세 히어로·전환 셸 — browse `heroBannerImageUrl` */
  heroBannerImageUrl: string | null;
  featuredItems: StoreFeaturedCardItem[];
  /** BROWSE — stats-backed platform popular (optional, ≠ representative tiles) */
  platformPopularProduct?: PlatformPopularRowProduct | null;
  isFeatured: boolean;
  coverEmoji?: string;
  /** browse·home-feed 진입 시 상세 뒤로가기용 1차 업종 slug */
  browsePrimarySlug?: string | null;
  /** 언어 중립 영업·결제 — 카드 문구는 `locale`로만 생성 */
  commerce: BrowseStoreCommerceSnapshot | null;
  rideMinutes?: number | null;
};

/** 목록 행 `data` 참조 재사용용 — 카드에 보이는 필드 전부 포함 */
export function storeRowCardDataEqual(a: StoreRowCardData, b: StoreRowCardData): boolean {
  const featuredEqual =
    a.featuredItems.length === b.featuredItems.length &&
    a.featuredItems.every((x, idx) => {
      const y = b.featuredItems[idx];
      return (
        x?.productId === y?.productId &&
        x?.name === y?.name &&
        x?.price === y?.price &&
        x?.imageUrl === y?.imageUrl
      );
    });
  return (
    a.slug === b.slug &&
    a.nameKo === b.nameKo &&
    a.tagline === b.tagline &&
    a.categoryLine === b.categoryLine &&
    a.regionBadge === b.regionBadge &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.reviewCount === b.reviewCount &&
    a.deliveryAvailable === b.deliveryAvailable &&
    a.pickupAvailable === b.pickupAvailable &&
    a.reservationAvailable === b.reservationAvailable &&
    a.minOrderLabel === b.minOrderLabel &&
    a.estPrepLabel === b.estPrepLabel &&
    (a.etaLabel ?? "") === (b.etaLabel ?? "") &&
    a.deliveryFeeLabel === b.deliveryFeeLabel &&
    a.deliveryFeeStrikePhp === b.deliveryFeeStrikePhp &&
    a.paymentMethodsLine === b.paymentMethodsLine &&
    a.distanceKm === b.distanceKm &&
    (a.routeDistanceKm ?? null) === (b.routeDistanceKm ?? null) &&
    (a.straightDistanceKm ?? null) === (b.straightDistanceKm ?? null) &&
    a.distancePolicyApplied === b.distancePolicyApplied &&
    a.distanceOutOfRange === b.distanceOutOfRange &&
    (a.distanceSource ?? null) === (b.distanceSource ?? null) &&
    (a.maxDeliveryDistanceKm ?? null) === (b.maxDeliveryDistanceKm ?? null) &&
    a.showStraightLineMapPin === b.showStraightLineMapPin &&
    a.menuPreview === b.menuPreview &&
    a.profileImageUrl === b.profileImageUrl &&
    a.heroBannerImageUrl === b.heroBannerImageUrl &&
    featuredEqual &&
    platformPopularRowEqual(a.platformPopularProduct, b.platformPopularProduct) &&
    a.isFeatured === b.isFeatured &&
    a.coverEmoji === b.coverEmoji &&
    (a.browsePrimarySlug ?? null) === (b.browsePrimarySlug ?? null) &&
    browseCommerceSnapshotEqual(a.commerce, b.commerce) &&
    (a.rideMinutes ?? null) === (b.rideMinutes ?? null)
  );
}

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function platformPopularRowEqual(
  a: PlatformPopularRowProduct | null | undefined,
  b: PlatformPopularRowProduct | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.productId === b.productId &&
    a.name === b.name &&
    a.price === b.price &&
    a.imageUrl === b.imageUrl &&
    a.totalQty === b.totalQty &&
    a.popularRank === b.popularRank &&
    a.windowDays === b.windowDays
  );
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/** browse 직선 거리 줄 — 빨간 위치 핀 */
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

export function homeFeedToRowCard(s: StoreHomeFeedItem): StoreRowCardData {
  const menuPreview =
    s.featuredItems.length > 0 ?
      s.featuredItems
        .slice(0, 3)
        .map((x) => x.name)
        .join(", ")
    : s.tagline;
  const rb = s.regionLabel?.trim().slice(0, 14) ?? null;
  return {
    storeId: s.id,
    slug: s.slug,
    nameKo: s.nameKo,
    tagline: s.tagline,
    categoryLine: s.primaryNameKo,
    regionBadge: rb && rb.length > 0 ? rb : null,
    status: s.status,
    rating: s.rating,
    reviewCount: s.reviewCount,
    deliveryAvailable: s.deliveryAvailable,
    pickupAvailable: s.pickupAvailable,
    reservationAvailable: false,
    minOrderLabel: s.minOrderLabel,
    estPrepLabel: s.estPrepLabel,
    etaLabel: s.etaLabel,
    deliveryFeeLabel: s.deliveryFeeLabel,
    deliveryFeeStrikePhp: s.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: s.paymentMethodsLine ?? "",
    distanceKm: s.distanceKm,
    routeDistanceKm: s.routeDistanceKm ?? null,
    straightDistanceKm: s.straightDistanceKm ?? null,
    distancePolicyApplied: s.distancePolicyApplied === true,
    distanceOutOfRange: s.distanceOutOfRange === true,
    distanceSource: null,
    maxDeliveryDistanceKm: s.maxDeliveryDistanceKm ?? null,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    heroBannerImageUrl: null,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: resolveStoreProductMediaUrl(x.imageUrl) ?? x.imageUrl ?? null,
    })),
    isFeatured: s.isFeatured,
    browsePrimarySlug: s.primarySlug?.trim() || null,
    commerce: s.commerce ?? null,
    rideMinutes: s.rideMinutes ?? null,
  };
}

/** browse API 인라인 `featuredItems` → 카드 썸네일(최대 6, imageUrl 있는 항목만 렌더). */
export function browseItemToRowCard(s: BrowseStoreListItem): StoreRowCardData {
  const menuPreview =
    s.featuredItems.length > 0 ?
      s.featuredItems
        .slice(0, 3)
        .map((x) => x.name)
        .join(", ")
    : s.tagline;
  const cat = `${s.primaryNameKo} · ${s.subNameKo}`;
  const rb = s.regionLabel?.trim().slice(0, 14) ?? null;
  return {
    storeId: s.id,
    slug: s.slug,
    nameKo: s.nameKo,
    tagline: s.tagline,
    categoryLine: cat,
    regionBadge: rb && rb.length > 0 ? rb : null,
    status: s.status,
    rating: s.rating,
    reviewCount: s.reviewCount,
    deliveryAvailable: s.deliveryAvailable,
    pickupAvailable: s.pickupAvailable,
    reservationAvailable: !!s.reservationAvailable,
    minOrderLabel: s.minOrderLabel ?? null,
    estPrepLabel: s.estPrepLabel ?? "",
    etaLabel: s.etaLabel,
    deliveryFeeLabel: s.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: s.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: s.paymentMethodsLine ?? "",
    distanceKm: s.distanceKm ?? null,
    routeDistanceKm: s.routeDistanceKm ?? null,
    straightDistanceKm: s.straightDistanceKm ?? null,
    distancePolicyApplied: s.distancePolicyApplied === true,
    distanceOutOfRange: s.distanceOutOfRange === true,
    distanceSource: s.distanceSource ?? null,
    maxDeliveryDistanceKm: s.maxDeliveryDistanceKm ?? null,
    /** browse 목록은 Routes 미사용 — 직선 거리만이므로 “경로 실패” 빨간 핀 비표시 */
    showStraightLineMapPin: false,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    heroBannerImageUrl: s.heroBannerImageUrl ?? null,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: x.imageUrl,
    })),
    platformPopularProduct: s.platformPopularProduct ?? null,
    isFeatured: s.isFeatured,
    browsePrimarySlug: s.primarySlug?.trim() || null,
    commerce: s.commerce ?? null,
    rideMinutes: s.rideMinutes ?? null,
  };
}

/**
 * Facebook 피드 게시물형 — 40px 아바타, 이름+메타 줄, 본문, 하단 액션 바
 */
function StoreDeliveryRowCardInner({
  data,
  locale,
  deliveryRideTimeSource = "google",
  featuredMenuHydration = "idle",
  browseStoreId,
  registerBrowseListItem,
}: {
  data: StoreRowCardData;
  /** `memo`가 언어 변경 시 행을 다시 그리도록 — `useI18n().language` 와 동일 값 */
  locale: AppLanguageCode;
  deliveryRideTimeSource?: string;
  featuredMenuHydration?: BrowseFeaturedMenuHydrationPhase;
  /** browse deferred featured hydrate — 안정 콜백(매 렌더 ref 신규 생성 방지) */
  browseStoreId?: string;
  registerBrowseListItem?: (storeId: string, node: HTMLElement | null) => void;
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
      prefetchStoreDetail(source, {
        force: true,
        focusProductId: productId,
      });
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
  const paymentMethodsUi = rowLabels?.paymentMethodsLine ?? "";
  const timeLabel = rowLabels?.etaLabel?.trim() || null;
  const minOrderLine = rowLabels?.minOrderLabel ?? null;
  const minOrderShort =
    minOrderLine?.includes(":") ? (minOrderLine.split(":").pop()?.trim() ?? null) : null;

  const freeDeliveryProven =
    data.deliveryAvailable &&
    (deliveryFeeUi === t("store_delivery_fee_free_line") ||
      deliveryFeeUi === t("store_free_delivery_applied"));
  const statusBadge =
    data.status === "open"
      ? { label: t("store_open_now"), className: "bg-sam-success-soft text-sam-success" }
      : data.status === "resting"
        ? { label: t("store_resting_now"), className: "bg-sam-warning-soft text-sam-warning" }
        : data.status === "closed"
          ? { label: t("store_closed_now"), className: "bg-sam-surface-muted text-sam-muted" }
          : { label: t("store_preparing"), className: "bg-sam-warning-soft text-sam-warning" };

  const featuredMenuImages = data.featuredItems
    .filter((x) => typeof x.imageUrl === "string" && x.imageUrl.trim().length > 0)
    .slice(0, STORES_LIST_PRESENTATION_SSOT.browseMenuPreviewMaxVisible);

  /** 메뉴 썸네일만 — 매장 프로필·히어로 배너를 타일로 쓰지 않음 (잘못된 GROCERY/반려동물 노출 방지) */
  const showFeaturedMenuSkeleton =
    featuredMenuHydration === "loading" && featuredMenuImages.length === 0;

  type FeaturedTile = StoreFeaturedCardItem & { kind?: "menu" };
  const featuredMenuTiles: FeaturedTile[] =
    featuredMenuImages.length > 0 ?
      featuredMenuImages.map((x) => ({ ...x, kind: "menu" as const }))
    : [];

  /** SSOT: isFeatured → recommended only. decorative delivery/pickup/reservation omitted. */
  const badgeLabels = resolveStoreListCardBadges({
    statusLabel: statusBadge.label,
    statusClassName: statusBadge.className,
    isFeatured: data.isFeatured,
    recommendedLabel: t("store_badge_recommended"),
    freeDeliveryProven,
    freeDeliveryLabel: t("store_free_delivery_short"),
    outOfRangeLabel: distanceOutOfRangeLabel,
  });

  const navigateToStore = useCallback(
    (source: "card" | "featured_menu" | "see_more", focusProductId?: string) => {
      const href = buildStoreDetailHref(data.slug, focusProductId);
      if (focusProductId) armStoreMenuFocusEntryIntent(focusProductId);
      saveDeliveryListScrollBeforeStoreNavigation();
      const browsePrimary =
        data.browsePrimarySlug?.trim() ||
        (typeof window !== "undefined"
          ? parseBrowsePrimarySlugFromPathname(window.location.pathname)
          : null);
      if (browsePrimary) {
        const browseSub =
          typeof window !== "undefined"
            ? parseBrowseSubSlugFromSearch(window.location.search)
            : "all";
        writeStoreDetailBrowseOrigin(data.slug, browsePrimary, browseSub);
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
        href,
        prefetch_hit: prefetch.hit,
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

  return (
    <li
      ref={setListItemRef}
      className="list-none select-none border-b border-[var(--delivery-border-light)] bg-[var(--delivery-bg-card)] px-4 py-[14px]"
      onPointerEnter={onRowPointerWarm}
      onFocus={onRowPointerWarm}
      data-presentation-owner={STORES_LIST_PRESENTATION_SSOT.owners.browseStore}
    >
      <div>
        {data.platformPopularProduct ?
          <p
            className="mb-1.5 line-clamp-1 text-[12.5px] font-semibold leading-snug text-[color:var(--delivery-primary)]"
          >
            {t("store_popular_menu_title")}: {data.platformPopularProduct.name}
          </p>
        : null}
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left transition-[transform,opacity] duration-120 active:scale-[0.985] active:opacity-95"
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
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-[color:var(--delivery-bg-thumb)]">
            {data.profileImageUrl ?
              <StoreProductThumbnail
                src={data.profileImageUrl}
                fill
                fetchPreset="rowFeatured"
                roundedClassName="rounded-[8px]"
                className="h-full w-full"
                loading="lazy"
              />
            : (
              <div className="flex h-full w-full items-center justify-center text-[13px] font-bold text-[color:var(--delivery-text-muted)]">
                {data.nameKo.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
              <h3 className="delivery-store-row__title line-clamp-1 tracking-[-0.01em]">
                {data.nameKo}
                <span className={`ml-2 inline-flex items-center gap-1 align-middle text-[14px] font-bold ${FB.ratingValue}`}>
                  <span className={`text-[12.5px] ${FB.ratingStar}`} aria-hidden>★</span>
                  {data.rating.toFixed(1)}
                  <span className={FB.ratingCount}>({reviewLabel(data.reviewCount)})</span>
                </span>
              </h3>
              <p className={`mt-1 line-clamp-1 text-[13px] font-medium leading-snug text-[color:var(--delivery-text-sub)]`}>
                {!data.deliveryAvailable ?
                  t("store_delivery_no_short")
                : deliveryFeeUi === t("store_free_delivery_applied") ?
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className={`text-[13px] ${FB.freeDelivery}`}>
                      {deliveryFeeUi}
                    </span>
                    {deliveryFeeStrikePhp != null && deliveryFeeStrikePhp > 0 ?
                      <span className={FB.strike}>
                        {formatMoneyPhp(deliveryFeeStrikePhp)}
                      </span>
                    : null}
                  </span>
                : deliveryFeeUi ?
                  <span className={`font-semibold ${FB.ratingValue}`}>{deliveryFeeUi}</span>
                : t("store_delivery_fee_per_store")}
              </p>
              <div className={`mt-1 flex min-w-0 items-center gap-1 overflow-hidden ${FB.metaRow}`}>
                {timeLabel ? (
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
                ) : null}
                {timeLabel && (showBrowseStraightPin || showPinHaversine) ? <span className={FB.metaDot}>·</span> : null}
                {showBrowseStraightPin ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-0.5 ${FB.metaStrong}`}
                    title={t("store_straight_distance_title")}
                  >
                    <BrowseListStraightDistancePinIcon className="shrink-0" />
                    <span>{d}</span>
                  </span>
                ) : showPinHaversine ? (
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
                ) : null}
                {(timeLabel || showBrowseStraightPin || showPinHaversine) && minOrderShort ? (
                  <span className={FB.metaDot}>·</span>
                ) : null}
                {minOrderShort ? (
                  <span className="min-w-0 truncate font-normal">
                    {t("store_min_order_short")}{" "}
                    <span className={FB.metaStrong}>{minOrderShort}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {badgeLabels.map((b) => (
                  <span
                    key={`${b.kind}-${b.label}`}
                    className={`inline-flex h-[21px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none ${b.className}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
          </div>
        </button>

        <div className="relative mt-2.5">
          {showFeaturedMenuSkeleton ? (
            <StoreBrowseFeaturedMenuSkeleton />
          ) : featuredMenuTiles.length > 0 ? (
            <div
              className={[
                "flex snap-x snap-mandatory gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain select-none",
                "touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              ].join(" ")}
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
              aria-label={t("store_featured_menu_image_aria")}
            >
              {featuredMenuTiles.map((item) => {
                const price = priceLabel(item.price);
                return (
                  <button
                    key={item.productId}
                    type="button"
                    aria-label={t("store_row_menu_view_aria", { store: data.nameKo, item: item.name })}
                    className={[
                      `relative shrink-0 snap-start overflow-hidden text-left ${STORES_HOME_MENU_TILE}`,
                      "h-14 w-14",
                      "transition-[transform,opacity] duration-120 active:scale-[0.98] active:opacity-90",
                    ].join(" ")}
                    onPointerEnter={() => warmFeaturedMenuNavigation(item.productId, "pointer_enter")}
                    onPointerDown={() => warmFeaturedMenuNavigation(item.productId, "pointer_down")}
                    onTouchStart={() => warmFeaturedMenuNavigation(item.productId, "touch_start")}
                    onClick={() => navigateToStore("featured_menu", item.productId)}
                  >
                    <StoreProductThumbnail
                      src={(item.imageUrl as string) || ""}
                      fill
                      fetchPreset="rowFeatured"
                      roundedClassName="rounded-[10px]"
                      className="h-full w-full"
                      loading="lazy"
                    />
                    {price ?
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-8">
                        <p className="line-clamp-1 text-[11.5px] font-semibold leading-snug text-white">
                          {item.name}
                        </p>
                        <p className="line-clamp-1 text-[12.5px] font-bold leading-snug text-white">{price}</p>
                      </div>
                    : null}
                  </button>
                );
              })}
              {featuredMenuImages.length > 0 ?
              <button
                type="button"
                aria-label={t("store_row_store_more_aria", { store: data.nameKo })}
                className={[
                  `flex shrink-0 snap-start items-center justify-center ${STORES_HOME_MENU_TILE_MORE}`,
                  "h-14 w-14",
                ].join(" ")}
                onClick={() => navigateToStore("see_more")}
              >
                <div className="flex flex-col items-center gap-1">
                  <svg className="h-5 w-5 opacity-90" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M7.5 4.5L12.5 10L7.5 15.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className={`text-[13px] font-semibold leading-none opacity-70 ${FB.ratingValue}`}>
                    {t("store_show_more")}
                  </span>
                </div>
              </button>
              : null}
            </div>
          ) : null}
        </div>

      </div>
    </li>
  );
}

/** 목록이 `homeFeedToRowCard(s)` 처럼 매 렌더 새 참조를 넘겨도, 표시 값 동일 시 행 리렌더 생략 */
export const StoreDeliveryRowCard = memo(
  StoreDeliveryRowCardInner,
  (prev, next) =>
    prev.locale === next.locale &&
    prev.deliveryRideTimeSource === next.deliveryRideTimeSource &&
    prev.featuredMenuHydration === next.featuredMenuHydration &&
    prev.browseStoreId === next.browseStoreId &&
    prev.registerBrowseListItem === next.registerBrowseListItem &&
    storeRowCardDataEqual(prev.data, next.data)
);

StoreDeliveryRowCard.displayName = "StoreDeliveryRowCard";
