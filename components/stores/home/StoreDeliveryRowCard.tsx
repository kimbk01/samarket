"use client";

import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { useRouter } from "next/navigation";
import { memo, useCallback } from "react";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
import {
  deliveryShellEntryBeginNavigation,
  deliveryShellEntryMark,
  deliveryShellEntryScheduleRouterPushStart,
} from "@/lib/dibay/delivery-shell-entry-trace";
import {
  buildStoreDetailHref,
  deliveryStoreDetailPrefetch,
  deliveryStoreDetailPrefetchForTap,
  deliveryStoreDetailScheduleTapPush,
} from "@/lib/dibay/delivery-store-detail-prefetch";
import { useDeliveryStoreDetailViewportPrefetch } from "@/lib/dibay/use-delivery-store-detail-viewport-prefetch";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { readStoreDetailListSeed, writeStoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import { showStoreDetailTransitionShell } from "@/lib/dibay/store-detail-transition-shell-store";
import { deliveryMenuVisibleBeginNavSession } from "@/lib/dibay/delivery-menu-visible-trace";
import {
  deliveryStoreMenusPrewarm,
  resetDeliveryStoreMenusPrewarmForTests,
} from "@/lib/dibay/delivery-store-menus-prewarm";
import {
  DELIVERY_PERF_TAG_ROUTE_TRANSITION,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

type StoreFeaturedCardItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

export type StoreRowCardData = {
  slug: string;
  nameKo: string;
  tagline: string | null;
  categoryLine: string | null;
  regionBadge: string | null;
  status: "open" | "preparing" | "closed";
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
  /** Routes 실패로 직선거리 fallback 일 때만 빨간 핀으로 표시 */
  showStraightLineMapPin?: boolean;
  menuPreview: string | null;
  profileImageUrl: string | null;
  featuredItems: StoreFeaturedCardItem[];
  isFeatured: boolean;
  coverEmoji?: string;
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
    a.showStraightLineMapPin === b.showStraightLineMapPin &&
    a.menuPreview === b.menuPreview &&
    a.profileImageUrl === b.profileImageUrl &&
    featuredEqual &&
    a.isFeatured === b.isFeatured &&
    a.coverEmoji === b.coverEmoji
  );
}

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
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
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: null,
    })),
    isFeatured: s.isFeatured,
  };
}

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
    estPrepLabel: s.estPrepLabel ?? "20~40분",
    etaLabel: s.etaLabel,
    deliveryFeeLabel: s.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: s.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: s.paymentMethodsLine ?? "",
    distanceKm: s.distanceKm ?? null,
    routeDistanceKm: s.routeDistanceKm ?? null,
    straightDistanceKm: s.straightDistanceKm ?? null,
    /** browse 목록은 Routes 미사용 — 직선 거리만이므로 “경로 실패” 빨간 핀 비표시 */
    showStraightLineMapPin: false,
    menuPreview: menuPreview?.trim() || null,
    profileImageUrl: s.profileImageUrl,
    featuredItems: s.featuredItems.map((x) => ({
      productId: x.productId,
      name: x.name,
      price: x.price,
      imageUrl: x.imageUrl,
    })),
    isFeatured: s.isFeatured,
  };
}

/**
 * Facebook 피드 게시물형 — 40px 아바타, 이름+메타 줄, 본문, 하단 액션 바
 */
function StoreDeliveryRowCardInner({ data }: { data: StoreRowCardData }) {
  const router = useRouter();
  const viewportRef = useDeliveryStoreDetailViewportPrefetch(data.slug);
  const prefetchStoreDetail = useCallback(
    (
      source: Parameters<typeof deliveryStoreDetailPrefetch>[2],
      opts?: { force?: boolean; focusProductId?: string | null }
    ) => {
      deliveryStoreDetailPrefetch(router, data.slug, source, opts);
    },
    [router, data.slug]
  );

  const warmFeaturedMenuNavigation = useCallback(
    (productId: string, source: "pointer_enter" | "pointer_down" | "touch_start") => {
      deliveryStoreMenusPrewarm(data.slug, { force: true });
      prefetchStoreDetail(source, {
        force: true,
        focusProductId: productId,
      });
    },
    [data.slug, prefetchStoreDetail]
  );
  const d = distLabel(data.distanceKm);
  const showBrowseStraightPin = data.showStraightLineMapPin === true && !!d;
  const showPinHaversine = !showBrowseStraightPin && d;

  const hasFreeDelivery =
    data.deliveryAvailable &&
    (data.deliveryFeeLabel === "배달비 무료" || data.deliveryFeeLabel === "배달비 무료 적용 중");
  const hasDiscountHint = data.isFeatured;
  const timeLabel =
    data.etaLabel?.trim() ||
    (data.estPrepLabel?.trim() ? `약 ${data.estPrepLabel.trim()}` : null);
  const minOrderShort = data.minOrderLabel?.replace(/^최소주문\s*/g, "")?.trim() || null;

  const featuredMenuImages = data.featuredItems
    .filter((x) => typeof x.imageUrl === "string" && x.imageUrl.trim().length > 0)
    .slice(0, 6);
  /** 서비스 형태(DB 플래그)와 배달비·프로모 뱃지를 분리 — 배달 방식(유료/무료적용/착불)과 무관하게 노출 */
  const serviceBadgeClass =
    "bg-[#F3F4F6] text-[#4B5563] dark:bg-[#2A2C2E] dark:text-[#B8C0CA]";
  const badgeLabels: { label: string; className: string }[] = [];
  if (data.deliveryAvailable) {
    badgeLabels.push({ label: "배달가능", className: serviceBadgeClass });
  }
  if (data.pickupAvailable) {
    badgeLabels.push({ label: "픽업가능", className: serviceBadgeClass });
  }
  if (hasFreeDelivery) {
    badgeLabels.push({ label: "무료배달", className: "bg-[#DDF8EE] text-[#0C7B63]" });
  }
  if (hasDiscountHint) {
    badgeLabels.push({ label: "즉시할인", className: "bg-[#EFE7FF] text-[#6D28D9]" });
  }
  if (data.reservationAvailable) {
    badgeLabels.push({ label: "예약가능", className: serviceBadgeClass });
  }

  const navigateToStore = useCallback(
    (source: "card" | "featured_menu" | "see_more", focusProductId?: string) => {
      const href = buildStoreDetailHref(data.slug, focusProductId);
      resetDeliveryStoreMenusPrewarmForTests();
      deliveryShellEntryBeginNavigation(data.slug);
      deliveryStoreMenusPrewarm(data.slug, { force: true });
      saveDeliveryListScrollBeforeStoreNavigation();
      const prefetch = deliveryStoreDetailPrefetchForTap(router, data.slug, href);
      markStoreDetailListSeedNavigation(data.slug);
      writeStoreDetailListSeed({
        slug: data.slug,
        store_name: data.nameKo,
        profile_image_url: data.profileImageUrl,
        rating_avg: data.rating,
        review_count: data.reviewCount,
        delivery_available: data.deliveryAvailable,
        pickup_available: data.pickupAvailable,
        tagline: data.tagline,
        region_badge: data.regionBadge,
      });
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
      const seed = readStoreDetailListSeed(data.slug);
      if (seed) showStoreDetailTransitionShell(seed, href);
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
        event: source === "featured_menu" ? "store_featured_menu_tap" : "store_card_tap",
        slug: data.slug,
        ...(focusProductId ? { product_id: focusProductId } : {}),
      });
      deliveryStoreDetailScheduleTapPush(href, prefetch, () => {
        deliveryShellEntryScheduleRouterPushStart(data.slug, href);
        router.push(href);
      });
    },
    [data, prefetchStoreDetail, router]
  );

  const onRowPointerWarm = useCallback(() => {
    deliveryStoreMenusPrewarm(data.slug);
    prefetchStoreDetail("pointer_enter");
  }, [data.slug, prefetchStoreDetail]);

  return (
    <li
      ref={viewportRef}
      className="list-none border-b border-[#ECEFF3] bg-white py-[15px] dark:border-[#2F3133] dark:bg-[#18191A]"
      onPointerEnter={onRowPointerWarm}
      onFocus={onRowPointerWarm}
    >
      <div>
        <div className="relative">
          {featuredMenuImages.length > 0 ? (
            <div
              className={[
                "flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              ].join(" ")}
              style={{ WebkitOverflowScrolling: "touch" }}
              aria-label="대표 메뉴 이미지"
            >
              {featuredMenuImages.map((item) => {
                const price = priceLabel(item.price);
                return (
                  <button
                    key={item.productId}
                    type="button"
                    aria-label={`${data.nameKo} ${item.name} 메뉴 보기`}
                    className={[
                      "relative shrink-0 snap-start overflow-hidden rounded-[10px] bg-[#F3F4F6] text-left dark:bg-[#2B2D30]",
                      "w-[calc((100%-8px)/3)] aspect-square",
                      "transition-[transform,opacity] duration-120 active:scale-[0.98] active:opacity-90",
                    ].join(" ")}
                    onPointerEnter={() => warmFeaturedMenuNavigation(item.productId, "pointer_enter")}
                    onPointerDown={() => warmFeaturedMenuNavigation(item.productId, "pointer_down")}
                    onTouchStart={() => warmFeaturedMenuNavigation(item.productId, "touch_start")}
                    onClick={() => navigateToStore("featured_menu", item.productId)}
                  >
                    <DeliveryMediaImage
                      src={(item.imageUrl as string) || ""}
                      alt=""
                      fill
                      sizes="(max-width: 420px) 33vw, 220px"
                      className="object-cover"
                      surface="list-row-featured"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-1.5 pt-8">
                      <p className="line-clamp-1 text-[11.5px] font-semibold leading-snug text-white">
                        {item.name}
                      </p>
                      <p className="line-clamp-1 text-[12.5px] font-bold leading-snug text-white">{price}</p>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                aria-label={`${data.nameKo} 매장 더보기`}
                className={[
                  "flex shrink-0 snap-start items-center justify-center rounded-[10px] bg-[#F7F7F7] text-[#111]",
                  "w-[calc((100%-8px)/3)] aspect-square",
                  "transition-[transform,opacity,background-color] duration-120 active:scale-[0.98] active:bg-[#ECEFF3] dark:bg-[#2A2C2E] dark:text-[#E4E6EB] dark:active:bg-[#34373A]",
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
                  <span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">
                    더보기
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`${data.nameKo} 매장 더보기`}
              className="flex h-[116px] w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#F7F7F7] text-[#111] transition-[transform,opacity,background-color] duration-120 active:scale-[0.98] active:bg-[#ECEFF3] dark:bg-[#2A2C2E] dark:text-[#E4E6EB] dark:active:bg-[#34373A]"
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
                <span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">더보기</span>
              </div>
            </button>
          )}
        </div>

        <button
          type="button"
          className="block w-full pt-2.5 text-left transition-[transform,opacity] duration-120 active:scale-[0.985] active:opacity-95"
          onPointerDown={() => {
            deliveryStoreMenusPrewarm(data.slug);
            prefetchStoreDetail("pointer_down", { force: true });
          }}
          onTouchStart={() => {
            deliveryStoreMenusPrewarm(data.slug);
            prefetchStoreDetail("touch_start", { force: true });
          }}
          onClick={() => navigateToStore("card")}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-[16px] font-bold leading-tight tracking-[-0.01em] text-[#111] dark:text-[#F3F4F6]">
                {data.nameKo}
                <span className="ml-2 inline-flex items-center gap-1 align-middle text-[14px] font-bold text-[#111] dark:text-[#F3F4F6]">
                  <span className="text-[12.5px] text-[#F4B400]" aria-hidden>★</span>
                  {data.rating.toFixed(1)}
                  <span className="text-[13px] font-medium text-[#6B7280]">({reviewLabel(data.reviewCount)})</span>
                </span>
              </h3>
              <p className="mt-1 line-clamp-1 text-[13px] font-medium leading-snug text-[#374151] dark:text-[#C7CDD4]">
                {!data.deliveryAvailable ?
                  "배달 불가"
                : data.deliveryFeeLabel === "배달비 무료 적용 중" ?
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[#2563EB] dark:text-[#8AB4FF]">
                      {data.deliveryFeeLabel}
                    </span>
                    {data.deliveryFeeStrikePhp != null && data.deliveryFeeStrikePhp > 0 ?
                      <span className="text-[13px] font-medium text-[#9CA3AF] line-through dark:text-[#6B7280]">
                        {formatMoneyPhp(data.deliveryFeeStrikePhp)}
                      </span>
                    : null}
                  </span>
                : data.deliveryFeeLabel ?
                  <span className="font-semibold text-[#111] dark:text-[#F3F4F6]">{data.deliveryFeeLabel}</span>
                : "배달비 매장별"}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[12.5px] leading-snug text-[#666] dark:text-[#9AA3AD]">
                {timeLabel ? (
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#4B5563] dark:text-[#B8C0CA]">
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
                {timeLabel && (showBrowseStraightPin || showPinHaversine) ? <span className="shrink-0 text-[#9CA3AF]">·</span> : null}
                {showBrowseStraightPin ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 font-medium text-[#4B5563] dark:text-[#B8C0CA]"
                    title="직선 거리"
                  >
                    <BrowseListStraightDistancePinIcon className="shrink-0" />
                    <span>{d}</span>
                  </span>
                ) : showPinHaversine ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 font-medium"
                    title="직선 거리"
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
                  <span className="shrink-0 text-[#9CA3AF]">·</span>
                ) : null}
                {minOrderShort ? (
                  <span className="min-w-0 truncate font-normal">
                    최소주문 <span className="font-medium text-[#4B5563] dark:text-[#B8C0CA]">{minOrderShort}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {badgeLabels.map((b) => (
                  <span
                    key={b.label}
                    className={`inline-flex h-[21px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none ${b.className}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              {data.paymentMethodsLine?.trim() ?
                <p
                  className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug text-[#6B7280] dark:text-[#9AA3AD]"
                  title={data.paymentMethodsLine}
                >
                  <span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">결제</span> ·{" "}
                  {data.paymentMethodsLine}
                </p>
              : null}
            </div>
          </div>
        </button>
      </div>
    </li>
  );
}

/** 목록이 `homeFeedToRowCard(s)` 처럼 매 렌더 새 참조를 넘겨도, 표시 값 동일 시 행 리렌더 생략 */
export const StoreDeliveryRowCard = memo(StoreDeliveryRowCardInner, (prev, next) =>
  storeRowCardDataEqual(prev.data, next.data)
);

StoreDeliveryRowCard.displayName = "StoreDeliveryRowCard";
