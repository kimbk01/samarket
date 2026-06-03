"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { StoreOwnerBannerCarousel } from "@/components/stores/StoreOwnerBannerCarousel";
import { StoreOwnerNoticeCards } from "@/components/stores/StoreOwnerNoticeCards";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  type AddStoreCartLineInput,
  useStoreCommerceCartActionsOptional,
} from "@/contexts/StoreCommerceCartContext";
import { openStoreCartConflict } from "@/lib/stores/store-cart-conflict-ui-store";
import { storeCartConflictExistingFromBlockedAdd } from "@/lib/stores/store-cart-conflict-meta";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import { StoreDetailCartChrome } from "@/components/stores/detail/StoreDetailCartChrome";
import { StoreDetailQuickShell } from "@/components/stores/StoreDetailQuickShell";
import { StoreDetailDeferredInfoSection } from "@/components/stores/store-detail/StoreDetailDeferredInfoSection";
import { StoreDetailMenusSection } from "@/components/stores/store-detail/StoreDetailMenusSection";
import { StoreReviewsSlidePanel } from "@/components/stores/store-detail/StoreReviewsSlidePanel";
import type { StoreMenuReviewRailProduct } from "@/components/stores/StoreMenuReviewFlowLink";
import type { StoreReviewsPanelOpenOptions } from "@/lib/stores/store-reviews-panel-open";
import { buildStoreMenuReviewRailProducts } from "@/lib/stores/build-store-menu-review-rail-products";
import { StoreDetailSummarySection } from "@/components/stores/store-detail/StoreDetailSummarySection";
import {
  groupStoreProductsByMenuSectionModel,
  pinFocusedProductInMenuSections,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import { localizeMenuSectionHeadings } from "@/lib/stores/localize-menu-section-headings";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { decodeSlugSegment, isStoreSlugOrderMenuRoot } from "@/lib/stores/store-consumer-route";
import { useStoreDetailMenuTabsViewport } from "@/lib/stores/use-store-detail-menu-tabs-viewport";
import { useStoreDetailScrollRootScroll } from "@/lib/stores/use-store-detail-scroll-root-scroll";
import {
  getStoreDetailAppScrollRoot,
  getStoreDetailScrollTop,
  setStoreDetailScrollTop,
} from "@/lib/ui/store-detail-scroll-root";
import { STORE_HERO_RUBBER_STRETCH_ATTR } from "@/lib/ui/rubber-band-gesture";
import { readStoreDetailFixedHeaderOffsetPxCached } from "@/lib/ui/store-detail-viewport-metrics";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import {
  readStoreFulfillmentPref,
  resolveStoreFulfillmentModeForEntry,
  writeStoreFulfillmentPref,
  STORE_FULFILLMENT_PREF_CHANGED_EVENT,
  type StoreFulfillmentPrefChangedDetail,
} from "@/lib/stores/store-fulfillment-pref";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { parseStoreDeliveryMeta, readWeekdaysLineFromJson } from "@/lib/stores/store-detail-meta";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import { useOwnerManagementHref } from "@/lib/stores/use-owner-management-href";
import { useStoreFavoriteToggle } from "@/lib/stores/use-store-favorite-toggle";
import {
  fetchStoreBannersDeduped,
  fetchStoreMenusDeduped,
  fetchStoreNoticesDeduped,
  fetchStorePublicBySlugDeduped,
  fetchStoreSummaryDeduped,
  peekStoreMenusPublicCache,
  peekStoreSummaryPublicCache,
  primeStorePublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";
import { useStorePublicSlugCacheInvalidation } from "@/lib/stores/use-store-public-slug-cache-invalidation";
import {
  dibayStoreDetailFlowPayloadKb,
  dibayStoreDetailFlowV2Log,
  dibayStoreDetailFlowWorstStage,
} from "@/lib/dibay/dibay-store-detail-flow-v2";
import type { StoreBannerPublicRow, StoreNoticePublicRow } from "@/lib/stores/store-banners-notices-public";
import {
  getStorePublicInitialSnapshot,
  hydrateStorePublicFromApiJson,
  storePublicProductRowsMap,
} from "@/lib/stores/store-public-page-hydrate";
import {
  parseStoreMenusPayload,
  parseStoreSummaryPayload,
  type StoreMenusPayload,
  type StoreSummaryPayload,
} from "@/lib/stores/store-detail-split-types";
import {
  dibayPerfOnCartbarUpdated,
  dibayPerfOnStoreDetailShellVisible,
  dibayPerfOnStoreMenuVisible,
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartBlockedByOtherStore,
} from "@/lib/dibay/delivery-flow-perf";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  DELIVERY_PERF_TAG_HERO_LAYOUT,
  DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE,
  DELIVERY_PERF_TAG_MENU_PASS,
  DELIVERY_PERF_TAG_STORE_ENTRY,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import {
  getStoreDetailListSeedSnapshot,
  isStoreDetailListSeedId,
  storeDetailPartialFromListSeed,
} from "@/lib/dibay/store-detail-list-seed";
import {
  STORE_DETAIL_HERO_CLAMP_MAX,
  STORE_DETAIL_HERO_CLAMP_MIN,
  STORE_DETAIL_HERO_CLAMP_VH,
  STORE_DETAIL_HERO_MIN_HEIGHT_PX,
} from "@/lib/dibay/store-detail-hero-layout";
import {
  markStoreDetailListSeedPass1Visible,
  traceStoreDetailSeedSummaryPatch,
} from "@/lib/dibay/store-detail-seed-patch-trace";
import { showStoreDetailToast } from "@/lib/stores/store-detail-toast-ui-store";
import {
  resolveStoreBrowseListHref,
  resolveStoreBrowseListHrefFromStore,
} from "@/lib/stores/resolve-store-browse-list-href";
import { useStoreDetailRenderGuard } from "@/lib/dibay/store-detail-render-guard";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import {
  deliveryMenuVisibleMarkFetchStart,
  deliveryMenuVisibleMarkFirstSectionReady,
  deliveryMenuVisibleMarkFirstVisible,
  deliveryMenuVisibleMarkMenuDataReady,
  deliveryMenuVisibleMarkNormalizeComplete,
  deliveryMenuVisibleBeginNavSession,
} from "@/lib/dibay/delivery-menu-visible-trace";
import {
  markMenusColdFillApplyEnd,
  markMenusColdFillApplyStart,
  markMenusColdFillFirstVisible,
  markMenusColdFillHydrationCommit,
  markMenusColdFillSuspenseRelease,
} from "@/lib/stores/menus-cold-fill-deep-breakdown";
import { normalizeStoreMenusForClient } from "@/lib/dibay/store-menus-client-normalize";
import {
  buildStoreDetailClientInitialState,
  parseBannersFromApiResponse,
  parseNoticesFromApiResponse,
  peekStoreDetailInstantHydrate,
} from "@/lib/dibay/store-detail-instant-hydrate";
import {
  getStoreDetailTransitionShellSnapshot,
  hideStoreDetailTransitionShell,
  subscribeStoreDetailTransitionShell,
} from "@/lib/dibay/store-detail-transition-shell-store";
import {
  dibayDeliveryDetailPhase2Log,
  dibayDeliveryDetailPhase2SinceMountOrNav,
} from "@/lib/dibay/delivery-detail-phase2-trace";

type StoreDetail = {
  id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
  store_categories?: { slug: string; name: string } | { slug: string; name: string }[] | null;
  description: string | null;
  phone: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  gallery_images_json: unknown;
  is_open: boolean | null;
  business_hours_json: unknown;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  created_at?: string;
  updated_at?: string;
};

export function StoreDetailPublic({
  slug,
  initialApiResponse,
}: {
  slug: string;
  /** 서버에서 동일 API 선조회 — 첫 페인트·캐시 프라임·카트 진입 가속 */
  initialApiResponse?: StoreApiJsonResponse | null;
}) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusProductId = searchParams.get("focusProduct")?.trim() || null;
  const commerceCartActions = useStoreCommerceCartActionsOptional();
  const decodedSlug = useMemo(() => decodeSlugSegment(slug), [slug]);

  const initialSnap = useMemo(
    () => getStorePublicInitialSnapshot(initialApiResponse),
    [initialApiResponse]
  );

  const [store, setStore] = useState<StoreDetail | null>(() =>
    initialSnap.store ? (initialSnap.store as StoreDetail) : null
  );

  /** 클라이언트에서만 목록 seed — `getStoreDetailListSeedSnapshot` 으로 참조 안정화 */
  const listSeedForPaint = useMemo(
    () => (typeof window === "undefined" ? null : getStoreDetailListSeedSnapshot(decodedSlug)),
    [decodedSlug]
  );

  const [transitionShellActive, setTransitionShellActive] = useState(
    () => getStoreDetailTransitionShellSnapshot()
  );

  useEffect(() => {
    return subscribeStoreDetailTransitionShell(() => {
      setTransitionShellActive(getStoreDetailTransitionShellSnapshot());
    });
  }, []);

  const storeForPaint = useMemo((): StoreDetail | null => {
    if (store) return store;
    if (!listSeedForPaint) return null;
    return storeDetailPartialFromListSeed(listSeedForPaint) as StoreDetail;
  }, [store, listSeedForPaint]);

  const [products, setProducts] = useState(() => initialSnap.products);
  const [recommendedMenuCards, setRecommendedMenuCards] = useState<StoreDetailProductCard[]>([]);
  const [popularMenuCards, setPopularMenuCards] = useState<StoreDetailProductCard[]>([]);
  const [productRowsById, setProductRowsById] = useState<Record<string, Record<string, unknown>>>(
    () => initialSnap.productRowsById
  );
  const [canSell, setCanSell] = useState(() => initialSnap.canSell);
  const [storeOrderability, setStoreOrderability] = useState(() => initialSnap.orderability);
  const [summaryLoading, setSummaryLoading] = useState(() => initialSnap.loading);
  const [menusLoading, setMenusLoading] = useState(() => initialSnap.loading);
  const [dbOff, setDbOff] = useState(() => initialSnap.dbOff);
  const [activeMenuSection, setActiveMenuSection] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] =
    useState<StorePublicFulfillmentMode>("local_delivery");
  const [headerSolid, setHeaderSolid] = useState(false);
  const [favoriteSeed, setFavoriteSeed] = useState(() => initialSnap.favoriteSeed);
  const [recentOrderCountMeta, setRecentOrderCountMeta] = useState(() => initialSnap.recentOrderCountMeta);
  const [publicBanners, setPublicBanners] = useState<StoreBannerPublicRow[]>(() => {
    if (typeof window === "undefined") return [];
    const init = buildStoreDetailClientInitialState(decodedSlug, initialSnap);
    const cached = parseBannersFromApiResponse(init.peek.bannersRes);
    return cached.length > 0 ? cached : init.publicBannersFromSeed;
  });
  const [publicNotices, setPublicNotices] = useState<StoreNoticePublicRow[]>(() => {
    if (typeof window === "undefined") return [];
    const init = buildStoreDetailClientInitialState(decodedSlug, initialSnap);
    return parseNoticesFromApiResponse(init.peek.noticesRes);
  });
  const [menuSoldOutBottom, setMenuSoldOutBottom] = useState(false);

  const menuStickyMeasureRef = useRef<HTMLDivElement>(null);
  const [menuStickyStackPx, setMenuStickyStackPx] = useState(118);
  const shellMarkedSlugRef = useRef<string | null>(null);
  const listSeedPass1LoggedRef = useRef<string | null>(null);
  const shellRenderedTracedRef = useRef<string | null>(null);
  const seedSummaryPatchTracedRef = useRef<string | null>(null);
  const instantHydrateSlugRef = useRef<string | null>(null);
  const menuMarkedStoreIdRef = useRef<string | null>(null);
  const menuNormalizeGenerationRef = useRef(0);
  /** Phase 2 실측: slug 전환 시점 클라 마운트 기준 t0 */
  const detailPhase2MountT0Ref = useRef<number | null>(null);
  const phase2FirstProductsLoggedRef = useRef(false);
  const phase2MenuSectionsLoggedRef = useRef(false);
  const detailFlowShellLoggedRef = useRef(false);
  const storeIdRef = useRef<string | null>(null);
  const storeRef = useRef(store);
  const productsRef = useRef(products);
  const productRowsByIdRef = useRef(productRowsById);
  const favoriteSeedRef = useRef(favoriteSeed);
  const recentOrderCountMetaRef = useRef(recentOrderCountMeta);
  /** slug 당 layout fetch 1회 — `loadSplitDetail` identity 변경 시 재호출 방지 */
  const splitDetailLoadSlugRef = useRef<string | null>(null);
  const loadSplitDetailRef = useRef<() => Promise<void>>(async () => {});
  /** 칩 탭·포커스 스크롤 중 scroll spy 가 섹션 인덱스를 왔다 갔다 하지 않게 */
  const menuScrollSpyLockRef = useRef<{ target: number; until: number } | null>(null);
  const menuStickyMeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 비동기 `loadSplitDetail*` 완료 시점에 URL slug 가 바뀌었는지 판별 */
  const latestSlugPropRef = useRef(slug);
  latestSlugPropRef.current = slug;
  storeRef.current = store ?? storeForPaint;
  productsRef.current = products;
  productRowsByIdRef.current = productRowsById;
  favoriteSeedRef.current = favoriteSeed;
  recentOrderCountMetaRef.current = recentOrderCountMeta;

  useEffect(() => {
    storeIdRef.current = store?.id ?? null;
  }, [store?.id]);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("detail-public", { slug: decodedSlug });
  }, [decodedSlug]);

  useLayoutEffect(() => {
    if (!decodedSlug) return;
    detailPhase2MountT0Ref.current = performance.now();
    phase2FirstProductsLoggedRef.current = false;
    phase2MenuSectionsLoggedRef.current = false;
    markMenusColdFillHydrationCommit(decodedSlug, detailPhase2MountT0Ref.current);
    dibayDeliveryDetailPhase2Log("component_mount", {
      slug: decodedSlug,
      hydration_blocked: false,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(detailPhase2MountT0Ref.current),
    });
  }, [decodedSlug]);

  useLayoutEffect(() => {
    if (!decodedSlug || products.length === 0 || phase2FirstProductsLoggedRef.current) return;
    phase2FirstProductsLoggedRef.current = true;
    dibayDeliveryDetailPhase2Log("first_menu_card_data_ready", {
      slug: decodedSlug,
      product_count: products.length,
      menus_loading: menusLoading,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(detailPhase2MountT0Ref.current),
    });
  }, [decodedSlug, products.length, menusLoading]);

  useLayoutEffect(() => {
    if (!decodedSlug) return;
    const hasListSeed = listSeedForPaint != null;
    if (!store && hasListSeed) {
      setStore(storeDetailPartialFromListSeed(listSeedForPaint) as StoreDetail);
    }
    deliveryShellEntryMark("client_mount_start", {
      slug: decodedSlug,
      seed_saved: hasListSeed,
    });
    const paintReady = store ?? listSeedForPaint;
    if (paintReady && shellRenderedTracedRef.current !== decodedSlug) {
      shellRenderedTracedRef.current = decodedSlug;
      deliveryShellEntryMark("shell_rendered", {
        slug: decodedSlug,
        source: hasListSeed ? "list_seed_sync" : "store_state",
        seed_saved: hasListSeed,
      });
      if (!detailFlowShellLoggedRef.current && detailPhase2MountT0Ref.current != null) {
        detailFlowShellLoggedRef.current = true;
        dibayStoreDetailFlowV2Log({
          slug: decodedSlug,
          shell_visible_ms: Math.round(performance.now() - detailPhase2MountT0Ref.current),
          cache_hit: hasListSeed || peekStoreSummaryPublicCache(decodedSlug) ? 1 : 0,
        });
      }
    }
  }, [decodedSlug, listSeedForPaint, store]);

  const { viewerFavorited, favoriteBusy, toggleFavorite } = useStoreFavoriteToggle(
    decodedSlug,
    favoriteSeed
  );

  /**
   * 목록 seed 로 DOM 은 그리되, 전환 오버레이·첫 체감 페인트는 summary(실데이터) 까지 유지한다.
   * 그렇지 않으면 seed 는 profile 히어로 ↔ summary 는 gallery[0] 히어로 로 바뀌며 '두 장면'이 보일 수 있음.
   */
  useLayoutEffect(() => {
    if (!storeForPaint || !isStoreDetailListSeedId(storeForPaint.id)) return;
    if (listSeedPass1LoggedRef.current === decodedSlug) return;
    listSeedPass1LoggedRef.current = decodedSlug;
    markStoreDetailListSeedPass1Visible(decodedSlug);
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_STORE_ENTRY, {
      event: "pass1_list_seed_visible",
      slug: decodedSlug,
      pass: 1,
      source: "list_seed",
      under_transition_overlay: true,
    });
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_HERO_LAYOUT, {
      event: "hero_box_locked",
      slug: decodedSlug,
      clamp_min: STORE_DETAIL_HERO_CLAMP_MIN,
      clamp_vh: STORE_DETAIL_HERO_CLAMP_VH,
      clamp_max: STORE_DETAIL_HERO_CLAMP_MAX,
      min_height_px: STORE_DETAIL_HERO_MIN_HEIGHT_PX,
    });
  }, [storeForPaint, decodedSlug]);

  useLayoutEffect(() => {
    if (!store || isStoreDetailListSeedId(store.id)) return;
    if (summaryLoading) return;
    if (shellMarkedSlugRef.current === decodedSlug) return;
    shellMarkedSlugRef.current = decodedSlug;
    hideStoreDetailTransitionShell(decodedSlug);
    dibayPerfOnStoreDetailShellVisible({ slug: decodedSlug });
    deliveryShellEntryMark("shell_visible", { slug: decodedSlug, source: "summary_api" });
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_STORE_ENTRY, {
      event: "pass1_summary_api_visible",
      slug: decodedSlug,
      pass: 1,
      source: "summary_api",
    });
  }, [store, summaryLoading, decodedSlug]);

  /** summary 완료 후에도 seed id 면(폴백)·오버레이만 남지 않도록 */
  useLayoutEffect(() => {
    if (summaryLoading) return;
    if (!store || !isStoreDetailListSeedId(store.id)) return;
    if (shellMarkedSlugRef.current === decodedSlug) return;
    shellMarkedSlugRef.current = decodedSlug;
    hideStoreDetailTransitionShell(decodedSlug);
    dibayPerfOnStoreDetailShellVisible({ slug: decodedSlug });
    deliveryShellEntryMark("shell_visible", { slug: decodedSlug, source: "list_seed_fallback" });
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_STORE_ENTRY, {
      event: "pass1_list_seed_fallback_visible",
      slug: decodedSlug,
      pass: 1,
      source: "list_seed_fallback",
    });
  }, [summaryLoading, store, decodedSlug]);

  const onMenuFirstVisible = useCallback(
    (source: string) => {
      const slugKey = decodedSlug.trim().toLowerCase();
      if (!slugKey) return;
      if (menuMarkedStoreIdRef.current === slugKey) return;
      menuMarkedStoreIdRef.current = slugKey;
      deliveryMenuVisibleMarkFirstVisible(slugKey, source);
      markMenusColdFillFirstVisible(slugKey);
      const sid = storeRef.current?.id;
      const storeId = sid && !isStoreDetailListSeedId(sid) ? sid : slugKey;
      dibayPerfOnStoreMenuVisible({ slug: slugKey, storeId });
      if (detailPhase2MountT0Ref.current != null) {
        dibayStoreDetailFlowV2Log({
          slug: slugKey,
          first_menu_card_visible_ms: Math.round(performance.now() - detailPhase2MountT0Ref.current),
        });
      }
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_PASS, {
        event: "pass2_menu_viewport_visible",
        slug: slugKey,
        store_id: storeId,
        pass: 2,
        source,
      });
    },
    [decodedSlug]
  );

  const isSameStoreDetail = (a: StoreDetail | null, b: StoreDetail | null): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.id === b.id &&
      a.slug === b.slug &&
      a.updated_at === b.updated_at &&
      a.is_open === b.is_open &&
      a.delivery_available === b.delivery_available &&
      a.pickup_available === b.pickup_available &&
      a.rating_avg === b.rating_avg &&
      a.review_count === b.review_count
    );
  };

  const isSameProductCards = (
    prev: StoreDetailProductCard[],
    next: StoreDetailProductCard[]
  ): boolean => {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i += 1) {
      const a = prev[i];
      const b = next[i];
      if (
        a.id !== b.id ||
        a.price !== b.price ||
        a.discount_price !== b.discount_price ||
        a.stock_qty !== b.stock_qty ||
        a.track_inventory !== b.track_inventory ||
        a.is_featured !== b.is_featured ||
        a.is_owner_recommended !== b.is_owner_recommended ||
        a.is_representative !== b.is_representative ||
        a.sort_order !== b.sort_order ||
        (a.menu_section_id ?? "") !== (b.menu_section_id ?? "") ||
        (a.popular_rank ?? null) !== (b.popular_rank ?? null)
      ) {
        return false;
      }
    }
    return true;
  };

  const applyLegacyHydrate = useCallback((json: unknown) => {
    const h = hydrateStorePublicFromApiJson(json);
    setDbOff(h.dbOff);
    if (h.dbOff) {
      setStore(null);
      setProducts([]);
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById({});
      setCanSell(false);
      setStoreOrderability({
        viewerIsOwner: false,
        viewerIsAdmin: false,
        canOrderStore: true,
        ownerBlockMessage: null,
      });
      setFavoriteSeed({ viewerFavorited: false, favoriteCount: 0 });
      setRecentOrderCountMeta(0);
      setMenuSoldOutBottom(false);
      return;
    }
    if (h.store) {
      const nextStore = h.store as StoreDetail;
      setStore((prev) => (isSameStoreDetail(prev, nextStore) ? prev : nextStore));
      setProducts((prev) => (isSameProductCards(prev, h.products) ? prev : h.products));
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setCanSell((prev) => (prev === h.canSell ? prev : h.canSell));
      setStoreOrderability(h.orderability);
      setFavoriteSeed(h.favoriteSeed);
      setRecentOrderCountMeta(h.recentOrderCountMeta);
      setProductRowsById(h.productRowsById);
      setMenuSoldOutBottom(false);
    } else {
      setStore(null);
      setProducts([]);
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById({});
      setCanSell(false);
      setStoreOrderability({
        viewerIsOwner: false,
        viewerIsAdmin: false,
        canOrderStore: true,
        ownerBlockMessage: null,
      });
      setFavoriteSeed({ viewerFavorited: false, favoriteCount: 0 });
      setRecentOrderCountMeta(0);
      setMenuSoldOutBottom(false);
    }
  }, []);

  const applySummaryPayload = useCallback((sumParsed: StoreSummaryPayload) => {
    if (!sumParsed.store) return;
    const wasListSeed = isStoreDetailListSeedId(storeRef.current?.id);
    const nextStore = {
      ...sumParsed.store,
      lat: sumParsed.store.lat ?? null,
      lng: sumParsed.store.lng ?? null,
    } as StoreDetail;
    setStore((prev) => (isSameStoreDetail(prev, nextStore) ? prev : nextStore));
    if (
      wasListSeed &&
      !isStoreDetailListSeedId(nextStore.id) &&
      seedSummaryPatchTracedRef.current !== nextStore.slug
    ) {
      seedSummaryPatchTracedRef.current = nextStore.slug;
      traceStoreDetailSeedSummaryPatch(decodedSlug);
    }
    setFavoriteSeed({
      viewerFavorited: !!sumParsed.meta?.viewer_favorited,
      favoriteCount: Number(sumParsed.meta?.favorite_count) || 0,
    });
    if (sumParsed.meta) {
      setStoreOrderability({
        viewerIsOwner: !!sumParsed.meta.viewer_is_owner,
        viewerIsAdmin: !!sumParsed.meta.viewer_is_admin,
        canOrderStore: sumParsed.meta.can_order_store !== false,
        ownerBlockMessage:
          typeof sumParsed.meta.owner_block_message === "string"
            ? sumParsed.meta.owner_block_message
            : null,
      });
    }
    setRecentOrderCountMeta(Number(sumParsed.meta?.recent_order_count) || 0);
    setDbOff(false);
  }, [decodedSlug]);

  const reloadSummaryAfterOwnerMutation = useCallback(async () => {
    const slug = decodedSlug;
    if (!slug) return;
    try {
      const sumRes = await fetchStoreSummaryDeduped(slug);
      if (decodeSlugSegment(latestSlugPropRef.current) !== slug) return;
      const sumParsed = parseStoreSummaryPayload(sumRes.json);
      if (sumRes.status === 200 && sumParsed.ok && sumParsed.store) {
        applySummaryPayload(sumParsed);
      }
    } catch {
      /* owner invalidate refetch — UI 유지 */
    }
  }, [decodedSlug, applySummaryPayload]);

  useStorePublicSlugCacheInvalidation(decodedSlug, reloadSummaryAfterOwnerMutation);

  const applyMenusPayloadCore = useCallback(
    (menuParsed: StoreMenusPayload) => {
      markMenusColdFillApplyStart(decodedSlug);
      const gen = (menuNormalizeGenerationRef.current += 1);
      const result = normalizeStoreMenusForClient(menuParsed, decodedSlug);

      setProductRowsById(result.viewport.productRowsById);
      setProducts((prev) =>
        isSameProductCards(prev, result.viewport.products) ? prev : result.viewport.products
      );
      setCanSell((prev) => (prev === result.viewport.canSell ? prev : result.viewport.canSell));
      setMenuSoldOutBottom((prev) =>
        prev === result.viewport.menuSoldOutBottom ? prev : result.viewport.menuSoldOutBottom
      );

      setRecommendedMenuCards((prev) => {
        const next = result.strips.recommendedMenuCards;
        if (
          prev.length === next.length &&
          prev.every((p, i) => p.id === next[i]?.id && p.sort_order === next[i]?.sort_order)
        ) {
          return prev;
        }
        return next;
      });
      setPopularMenuCards((prev) => {
        const next = result.strips.popularMenuCards;
        if (
          prev.length === next.length &&
          prev.every(
            (p, i) =>
              p.id === next[i]?.id && (p.popular_rank ?? 0) === (next[i]?.popular_rank ?? 0)
          )
        ) {
          return prev;
        }
        return next;
      });
      setFavoriteSeed(result.strips.favoriteSeed);
      setRecentOrderCountMeta(result.strips.recentOrderCountMeta);

      deliveryMenuVisibleMarkNormalizeComplete(decodedSlug, result.breakdown.total_ms);
      deliveryMenuVisibleMarkFirstSectionReady(decodedSlug, result.breakdown.category_count);

      result.scheduleFullCatalog((full) => {
        if (menuNormalizeGenerationRef.current !== gen) return;
        if (decodeSlugSegment(latestSlugPropRef.current) !== decodedSlug) return;
        setProductRowsById(full.productRowsById);
        setProducts((prev) => (isSameProductCards(prev, full.products) ? prev : full.products));
      });

      markMenusColdFillApplyEnd(decodedSlug);
      return result.viewport.products;
    },
    [decodedSlug]
  );

  const mergeLegacyProductsOnly = useCallback((json: unknown) => {
    const h = hydrateStorePublicFromApiJson(json);
    const sid = storeIdRef.current;
    if (h.store && sid && String(h.store.id) === String(sid)) {
      setProducts((prev) => (isSameProductCards(prev, h.products) ? prev : h.products));
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById(h.productRowsById);
      setMenuSoldOutBottom(false);
      setCanSell((prev) => (prev === h.canSell ? prev : h.canSell));
      setStoreOrderability(h.orderability);
    } else if (h.store) {
      applyLegacyHydrate(json);
    } else {
      setProducts([]);
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById({});
      setCanSell(false);
      setStoreOrderability({
        viewerIsOwner: false,
        viewerIsAdmin: false,
        canOrderStore: true,
        ownerBlockMessage: null,
      });
      setMenuSoldOutBottom(false);
    }
  }, [applyLegacyHydrate]);

  const applyMenusResponseIfReady = useCallback(
    (menuRes: StoreApiJsonResponse, startedSlugDecode: string): boolean => {
      const menuParsed = parseStoreMenusPayload(menuRes.json);
      const menusReady =
        menuRes.status === 200 &&
        menuParsed.ok === true &&
        menuParsed.meta?.source !== "supabase_unconfigured" &&
        Array.isArray(menuParsed.products);

      if (!menusReady) return false;

      deliveryMenuVisibleMarkMenuDataReady(startedSlugDecode);
      applyMenusPayloadCore(menuParsed);
      setMenusLoading(false);
      markMenusColdFillSuspenseRelease(startedSlugDecode);
      return true;
    },
    [applyMenusPayloadCore]
  );

  /** prewarm 캐시·목록 seed — slug 당 1회만 동기 반영(무한 setState 방지) */
  useLayoutEffect(() => {
    if (!decodedSlug || instantHydrateSlugRef.current === decodedSlug) return;
    instantHydrateSlugRef.current = decodedSlug;

    const init = buildStoreDetailClientInitialState(decodedSlug, initialSnap);
    if (init.storeFromSeed) {
      setStore((prev) => prev ?? (init.storeFromSeed as StoreDetail));
    }
    if (init.peek.summaryParsed?.store) {
      applySummaryPayload(init.peek.summaryParsed);
    }
    const banCached = parseBannersFromApiResponse(init.peek.bannersRes);
    if (banCached.length > 0) {
      setPublicBanners(banCached);
    } else if (init.publicBannersFromSeed.length > 0) {
      setPublicBanners(init.publicBannersFromSeed);
    }
    const notCached = parseNoticesFromApiResponse(init.peek.noticesRes);
    if (notCached.length > 0) setPublicNotices(notCached);
    if (init.peek.menusRes && init.peek.menusParsed) {
      applyMenusResponseIfReady(init.peek.menusRes, decodedSlug);
    }
    if (init.hasInstantPaint) {
      setSummaryLoading(false);
    }
    hideStoreDetailTransitionShell(decodedSlug);
  }, [decodedSlug, applySummaryPayload, applyMenusResponseIfReady, initialSnap]);

  const applyBannersAndNotices = useCallback(
    (banRes: StoreApiJsonResponse, notRes: StoreApiJsonResponse) => {
      const banJ = banRes.json as { ok?: boolean; banners?: StoreBannerPublicRow[] };
      const notJ = notRes.json as { ok?: boolean; notices?: StoreNoticePublicRow[] };
      setPublicBanners(
        banRes.status === 200 && banJ?.ok && Array.isArray(banJ.banners) ? banJ.banners : []
      );
      setPublicNotices(
        notRes.status === 200 && notJ?.ok && Array.isArray(notJ.notices) ? notJ.notices : []
      );
    },
    []
  );

  const loadSplitDetail = useCallback(async () => {
    const startedSlugDecode = decodeSlugSegment(slug);
    const mountT0 = detailPhase2MountT0Ref.current;
    deliveryMenuVisibleBeginNavSession(startedSlugDecode);
    deliveryMenuVisibleMarkFetchStart(startedSlugDecode);

    /**
     * 메뉴 GET 은 summary/setState 로 인한 페인트·레이아웃보다 먼저 시작 — 워터폴 단축(B).
     * 동일 runSingleFlight 키로 loadSplitDetail 내부와 합류, 중복 요청 없음.
     */
    dibayDeliveryDetailPhase2Log("waterfall", {
      slug: startedSlugDecode,
      step: "menus_fetch_scheduled_before_loading_flags",
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    const menusPromise = fetchStoreMenusDeduped(slug, { fetchPath: "loadSplitDetail" });

    const instantPeek = peekStoreDetailInstantHydrate(startedSlugDecode);
    const hasInstantPaint =
      Boolean(instantPeek.summaryParsed?.store) ||
      Boolean(instantPeek.listSeed) ||
      isStoreDetailListSeedId(storeRef.current?.id) ||
      Boolean(storeRef.current?.id && !isStoreDetailListSeedId(storeRef.current.id));
    const hasVisibleMenus = productsRef.current.length > 0;

    if (!hasInstantPaint) {
      setSummaryLoading(true);
    }
    if (!instantPeek.menusParsed?.ok && !hasVisibleMenus) {
      setMenusLoading(true);
    }
    setDbOff(false);
    const banPromise = fetchStoreBannersDeduped(slug);
    const notPromise = fetchStoreNoticesDeduped(slug);

    const menusApplyPromise = menusPromise
      .then((menuRes) => {
        dibayDeliveryDetailPhase2Log("menus_fetch_response", {
          slug: startedSlugDecode,
          status: menuRes.status,
          fetch_path: "loadSplitDetail",
          ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
        });
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return false;
        const applied = applyMenusResponseIfReady(menuRes, startedSlugDecode);
        if (applied) {
          dibayDeliveryDetailPhase2Log("menus_apply_complete", {
            slug: startedSlugDecode,
            fetch_path: "loadSplitDetail",
            ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
          });
        }
        return applied;
      })
      .catch(() => false);

    const summaryHadCache = !!peekStoreSummaryPublicCache(slug);
    const menusHadCache = !!peekStoreMenusPublicCache(slug);
    const summaryFetchT0 = performance.now();
    const summaryFetchPromise = fetchStoreSummaryDeduped(slug);
    dibayDeliveryDetailPhase2Log("summary_fetch_start", {
      slug: startedSlugDecode,
      parallel_with_menus: true,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    const [sumRes, menusReady] = await Promise.all([
      summaryFetchPromise,
      menusApplyPromise,
    ]);
    const summaryFetchMs = Math.round(performance.now() - summaryFetchT0);
    dibayDeliveryDetailPhase2Log("summary_fetch_end", {
      slug: startedSlugDecode,
      status: sumRes.status,
      summary_fetch_ms: summaryFetchMs,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
      setSummaryLoading(false);
      setMenusLoading(false);
      return;
    }

    const sumParsed = parseStoreSummaryPayload(sumRes.json);

    if (sumParsed.meta?.source === "supabase_unconfigured") {
      setDbOff(true);
      setStore(null);
      setProducts([]);
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById({});
      setCanSell(false);
      setFavoriteSeed({ viewerFavorited: false, favoriteCount: 0 });
      setRecentOrderCountMeta(0);
      setPublicBanners([]);
      setPublicNotices([]);
      setMenuSoldOutBottom(false);
      setSummaryLoading(false);
      setMenusLoading(false);
      return;
    }

    const summaryReady =
      sumRes.status === 200 && sumParsed.ok === true && !!sumParsed.store && sumParsed.store.id;

    if (!summaryReady) {
      const leg = await fetchStorePublicBySlugDeduped(slug);
      if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
        setSummaryLoading(false);
        setMenusLoading(false);
        return;
      }
      applyLegacyHydrate(leg.json);
      setPublicBanners([]);
      setPublicNotices([]);
      setSummaryLoading(false);
      setMenusLoading(false);
      return;
    }

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
      setSummaryLoading(false);
      setMenusLoading(false);
      return;
    }

    applySummaryPayload(sumParsed);
    dibayDeliveryDetailPhase2Log("header_summary_apply", {
      slug: startedSlugDecode,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    setSummaryLoading(false);

    void Promise.all([banPromise, notPromise])
      .then(([banRes, notRes]) => {
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;
        applyBannersAndNotices(banRes, notRes);
      })
      .catch(() => {
        /* empty banners/notices */
      });

    dibayDeliveryDetailPhase2Log("menus_apply_await_settled", {
      slug: startedSlugDecode,
      menus_ready: menusReady,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    dibayStoreDetailFlowV2Log({
      slug: startedSlugDecode,
      summary_fetch_ms: summaryFetchMs,
      menus_fetch_ms: null,
      cache_hit: summaryHadCache || menusHadCache ? 1 : 0,
      singleflight_hit: summaryHadCache || menusHadCache ? 1 : 0,
      payload_kb: dibayStoreDetailFlowPayloadKb(sumRes.json),
      fetch_path: "loadSplitDetail",
      ...dibayStoreDetailFlowWorstStage({
        summary_fetch: summaryFetchMs,
      }),
    });
    if (menusReady) {
      /* menusLoading 은 core 적용 직후 해제됨 */
    } else {
      try {
        const leg = await fetchStorePublicBySlugDeduped(slug);
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
          setMenusLoading(false);
          return;
        }
        mergeLegacyProductsOnly(leg.json);
      } catch {
        setProducts([]);
        setRecommendedMenuCards([]);
        setPopularMenuCards([]);
        setProductRowsById({});
      }
      setMenusLoading(false);
    }
  }, [
    slug,
    applyLegacyHydrate,
    applyBannersAndNotices,
    applyMenusResponseIfReady,
    applySummaryPayload,
    mergeLegacyProductsOnly,
  ]);

  const loadSplitDetailSilent = useCallback(async () => {
    const startedSlugDecode = decodeSlugSegment(slug);
    if (peekStoreSummaryPublicCache(slug) && peekStoreMenusPublicCache(slug)) {
      dibayDeliveryDetailPhase2Log("waterfall_silent_skipped", {
        slug: startedSlugDecode,
        reason: "summary_menus_client_cache_fresh",
        ...dibayDeliveryDetailPhase2SinceMountOrNav(detailPhase2MountT0Ref.current),
      });
      return;
    }
    const mountT0 = detailPhase2MountT0Ref.current;
    deliveryMenuVisibleBeginNavSession(startedSlugDecode);
    deliveryMenuVisibleMarkFetchStart(startedSlugDecode);
    dibayDeliveryDetailPhase2Log("waterfall_silent", {
      slug: startedSlugDecode,
      step: "menus_fetch_scheduled_first",
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    const menusPromise = fetchStoreMenusDeduped(slug, { fetchPath: "loadSplitDetail" });
    const banPromise = fetchStoreBannersDeduped(slug);
    const notPromise = fetchStoreNoticesDeduped(slug);

    const menusApplyPromise = menusPromise
      .then((menuRes) => {
        dibayDeliveryDetailPhase2Log("menus_fetch_response", {
          slug: startedSlugDecode,
          status: menuRes.status,
          fetch_path: "loadSplitDetailSilent",
          ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
        });
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return false;
        const applied = applyMenusResponseIfReady(menuRes, startedSlugDecode);
        if (applied) {
          dibayDeliveryDetailPhase2Log("menus_apply_complete", {
            slug: startedSlugDecode,
            fetch_path: "loadSplitDetailSilent",
            ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
          });
        }
        return applied;
      })
      .catch(() => false);

    const summaryFetchT0 = performance.now();
    const summaryFetchPromise = fetchStoreSummaryDeduped(slug);
    dibayDeliveryDetailPhase2Log("summary_fetch_start_silent", {
      slug: startedSlugDecode,
      parallel_with_menus: true,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });
    const [sumRes, menusReady] = await Promise.all([
      summaryFetchPromise,
      menusApplyPromise,
    ]);
    dibayDeliveryDetailPhase2Log("summary_fetch_end_silent", {
      slug: startedSlugDecode,
      status: sumRes.status,
      summary_fetch_ms: Math.round(performance.now() - summaryFetchT0),
      ...dibayDeliveryDetailPhase2SinceMountOrNav(mountT0),
    });

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;

    const sumParsed = parseStoreSummaryPayload(sumRes.json);

    if (sumParsed.meta?.source === "supabase_unconfigured") {
      setDbOff(true);
      setPublicBanners([]);
      setPublicNotices([]);
      return;
    }

    const summaryReady =
      sumRes.status === 200 && sumParsed.ok === true && !!sumParsed.store && sumParsed.store.id;

    if (!summaryReady) {
      const leg = await fetchStorePublicBySlugDeduped(slug);
      if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;
      applyLegacyHydrate(leg.json);
      setPublicBanners([]);
      setPublicNotices([]);
      return;
    }

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;

    applySummaryPayload(sumParsed);

    void Promise.all([banPromise, notPromise])
      .then(([banRes, notRes]) => {
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;
        applyBannersAndNotices(banRes, notRes);
      })
      .catch(() => {
        /* empty */
      });

    if (menusReady) {
      return;
    }

    try {
      const leg = await fetchStorePublicBySlugDeduped(slug);
      if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;
      mergeLegacyProductsOnly(leg.json);
    } catch {
      /* noop */
    }
  }, [
    slug,
    applyLegacyHydrate,
    applyBannersAndNotices,
    applyMenusResponseIfReady,
    applySummaryPayload,
    mergeLegacyProductsOnly,
  ]);

  loadSplitDetailRef.current = loadSplitDetail;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setOpenTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (initialApiResponse?.status === 200) {
      primeStorePublicCache(slug, initialApiResponse);
    }
    const startedSlugDecode = decodeSlugSegment(slug);
    if (!startedSlugDecode) return;
    if (splitDetailLoadSlugRef.current === startedSlugDecode) return;
    splitDetailLoadSlugRef.current = startedSlugDecode;
    void loadSplitDetailRef.current();
  }, [slug, initialApiResponse]);

  useRefetchOnPageShowRestore(() => void loadSplitDetailSilent());

  const syncHeaderSolidFromScroll = useCallback(() => {
    const hero = document.getElementById("store-hero-media");
    const headerH = readStoreDetailFixedHeaderOffsetPxCached();
    if (!hero) {
      setHeaderSolid(true);
      return;
    }
    const rubberPx = Number(hero.getAttribute(STORE_HERO_RUBBER_STRETCH_ATTR) ?? 0);
    if (rubberPx > 0) return;

    const bottom = hero.getBoundingClientRect().bottom;
    const hysteresisPx = 10;
    setHeaderSolid((prev) => {
      const next = prev
        ? bottom <= headerH + hysteresisPx
        : bottom <= headerH - hysteresisPx;
      return prev === next ? prev : next;
    });
  }, []);

  useStoreDetailScrollRootScroll(
    syncHeaderSolidFromScroll,
    [publicBanners.length, store?.slug, syncHeaderSolidFromScroll],
    Boolean(store?.slug)
  );

  const ownerManagementHref = useOwnerManagementHref(
    store ? { id: store.id, slug: store.slug } : null
  );

  /** 이미 RSC 등으로 상품이 있으면 스켈레톤으로 가리지 않음(재검증 중에도 목록 유지) */
  const showMenusSkeleton = useMemo(() => {
    if (!menusLoading) return false;
    if (products.length === 0) return true;
    if (store?.slug && store.slug !== decodedSlug) return true;
    return false;
  }, [menusLoading, products.length, store?.slug, decodedSlug]);

  const menuSections = useMemo(
    () => groupStoreProductsByMenuSectionModel(products, menuSoldOutBottom),
    [products, menuSoldOutBottom]
  );

  const menuSectionsFiltered = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    let sections =
      !q ?
        menuSections
      : menuSections
          .map((s) => ({
            ...s,
            items: s.items.filter(
              (p) =>
                p.title.toLowerCase().includes(q) ||
                (p.summary && p.summary.toLowerCase().includes(q))
            ),
          }))
          .filter((s) => s.items.length > 0);
    if (focusProductId && !q) {
      sections = pinFocusedProductInMenuSections(sections, focusProductId);
    }
    return localizeMenuSectionHeadings(sections, language);
  }, [menuSections, menuQuery, focusProductId, language]);

  const menuProductsForReviewRail = useMemo((): StoreMenuReviewRailProduct[] => {
    const sectionItems = menuSectionsFiltered.flatMap((s) => s.items);
    return buildStoreMenuReviewRailProducts({
      popularMenuCards,
      recommendedMenuCards,
      menuSectionItems: sectionItems,
    });
  }, [popularMenuCards, recommendedMenuCards, menuSectionsFiltered]);

  const [reviewsPanelOpen, setReviewsPanelOpen] = useState(false);
  const [reviewsPanelOptions, setReviewsPanelOptions] = useState<StoreReviewsPanelOpenOptions>({});

  const handleOpenReviewsPanel = useCallback((opts?: StoreReviewsPanelOpenOptions) => {
    setReviewsPanelOptions(opts ?? {});
    setReviewsPanelOpen(true);
  }, []);

  const handleCloseReviewsPanel = useCallback(() => {
    setReviewsPanelOpen(false);
  }, []);

  const menuSectionScrollKey = useMemo(
    () => menuSectionsFiltered.map((s) => `${s.heading}:${s.items.length}`).join("\0"),
    [menuSectionsFiltered]
  );

  useLayoutEffect(() => {
    if (!decodedSlug || menuSectionsFiltered.length === 0 || phase2MenuSectionsLoggedRef.current) return;
    phase2MenuSectionsLoggedRef.current = true;
    dibayDeliveryDetailPhase2Log("first_category_sections_ready", {
      slug: decodedSlug,
      section_count: menuSectionsFiltered.length,
      ...dibayDeliveryDetailPhase2SinceMountOrNav(detailPhase2MountT0Ref.current),
    });
  }, [decodedSlug, menuSectionsFiltered.length]);

  useEffect(() => {
    setActiveMenuSection((i) =>
      menuSectionsFiltered.length === 0 ? 0 : Math.min(i, Math.max(0, menuSectionsFiltered.length - 1))
    );
  }, [menuSectionsFiltered.length]);

  useEffect(() => {
    if (!store?.slug || typeof window === "undefined") return;
    const mode = resolveStoreFulfillmentModeForEntry(
      {
        deliveryAvailable: store.delivery_available === true,
        pickupAvailable: store.pickup_available !== false,
      },
      readStoreFulfillmentPref(store.slug)
    );
    setFulfillmentMode(mode);
  }, [store?.slug, store?.delivery_available, store?.pickup_available]);

  useEffect(() => {
    const slugKey = store?.slug?.trim();
    if (!slugKey) return;
    const h = (e: Event) => {
      const d = (e as CustomEvent<StoreFulfillmentPrefChangedDetail>).detail;
      if (!d?.slug) return;
      if (d.slug.trim() === slugKey || d.slug.trim().toLowerCase() === slugKey.toLowerCase()) {
        setFulfillmentMode(d.mode);
      }
    };
    window.addEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, h);
    return () => window.removeEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, h);
  }, [store?.slug]);

  const syncActiveMenuSectionFromScroll = useCallback(() => {
    if (menuSectionsFiltered.length <= 1) return;
    const lock = menuScrollSpyLockRef.current;
    if (lock && performance.now() < lock.until) {
      setActiveMenuSection((prev) => (prev === lock.target ? prev : lock.target));
      return;
    }
    const stickyEl = menuStickyMeasureRef.current;
    const stickyBottom = stickyEl ? stickyEl.getBoundingClientRect().bottom : 120;
    let best = 0;
    menuSectionsFiltered.forEach((_, i) => {
      const el = document.getElementById(`store-sec-${i}`);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top <= stickyBottom + 6) best = i;
    });
    setActiveMenuSection((prev) => (prev === best ? prev : best));
  }, [menuSectionsFiltered]);

  useStoreDetailScrollRootScroll(
    syncActiveMenuSectionFromScroll,
    [menuSectionsFiltered.length, menuSectionScrollKey, syncActiveMenuSectionFromScroll],
    menuSectionsFiltered.length > 1
  );

  const commerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open);
  }, [store, openTick]);

  const isOpen = commerce?.isOpenForCommerce ?? true;

  useStoreDetailRenderGuard(decodedSlug, {
    slug: decodedSlug,
    storeId: store?.id ?? "",
    summaryLoading,
    menusLoading,
    activeMenuSection,
    menuQuery,
    menuSearchOpen,
    productCount: products.length,
    recommendedCount: recommendedMenuCards.length,
    popularCount: popularMenuCards.length,
    headerSolid,
    fulfillmentMode,
    bannerCount: publicBanners.length,
    noticeCount: publicNotices.length,
    favoriteSeedKey: `${favoriteSeed.viewerFavorited}:${favoriteSeed.favoriteCount}`,
    dbOff,
    canSell,
    menuSoldOutBottom,
    showMenusSkeleton,
    viewerFavorited,
    favoriteBusy,
    openTick,
    recentOrderCount: recentOrderCountMeta,
  });

  useEffect(() => {
    if (!store) return;
    const dA = store.delivery_available === true;
    const pA = store.pickup_available !== false;
    const slugStore = store.slug;
    if (fulfillmentMode === "local_delivery" && !dA) {
      setFulfillmentMode("pickup");
      writeStoreFulfillmentPref(slugStore, "pickup");
    } else if (fulfillmentMode === "pickup" && !pA && dA) {
      setFulfillmentMode("local_delivery");
      writeStoreFulfillmentPref(slugStore, "local_delivery");
    }
  }, [store, fulfillmentMode]);

  useEffect(() => {
    if (summaryLoading || !store || menusLoading) return;
    const el = menuStickyMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setMenuStickyStackPx((prev) => {
        const h = Math.max(48, Math.ceil(el.getBoundingClientRect().height));
        return prev === h ? prev : h;
      });
    };
    const scheduleMeasure = () => {
      if (menuStickyMeasureTimerRef.current) clearTimeout(menuStickyMeasureTimerRef.current);
      menuStickyMeasureTimerRef.current = setTimeout(() => {
        menuStickyMeasureTimerRef.current = null;
        measure();
      }, 48);
    };
    measure();
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (menuStickyMeasureTimerRef.current) clearTimeout(menuStickyMeasureTimerRef.current);
    };
  }, [summaryLoading, menusLoading, store?.id, menuQuery, menuSearchOpen]);

  const storeMenuRootActive = isStoreSlugOrderMenuRoot(pathname ?? "", decodedSlug);
  const blockMenuTabsAnchor = summaryLoading && !storeForPaint;
  const { menuTabsViewportReady } = useStoreDetailMenuTabsViewport({
    pathname,
    decodedSlug,
    blockMenuTabsAnchor,
    menusLoading,
    menuTabsMeasurable: storeMenuRootActive && !menusLoading && menuSectionsFiltered.length > 0,
    menuStickyMeasureRef,
  });

  const quickAddFromCard = useCallback(
    (p: StoreDetailProductCard): boolean => {
      if (!commerceCartActions || !store || p.has_options) return false;
      if (storeOrderability.canOrderStore === false) {
        showStoreDetailToast(store.id, t("store_err_own_store_block"));
        return true;
      }
      if (commerce ? !commerce.isOpenForCommerce : false) return false;
      const soldOut =
        p.product_status === "sold_out" || (p.track_inventory && p.stock_qty <= 0);
      if (soldOut) return false;
      const hasDiscount =
        p.discount_price != null &&
        Number.isFinite(p.discount_price) &&
        p.discount_price < p.price &&
        p.price > 0;
      const unitPrice = hasDiscount ? Math.floor(p.discount_price!) : Math.floor(p.price);
      const listBaseUnit = Math.floor(p.price);
      const hasLineDiscount = listBaseUnit > unitPrice && unitPrice >= 0 && listBaseUnit > 0;
      let discountPct: number | null = null;
      if (hasLineDiscount) {
        if (p.discount_percent && p.discount_percent > 0) {
          discountPct = p.discount_percent;
        } else if (hasDiscount && p.discount_price != null) {
          discountPct = approximateDiscountPercent(listBaseUnit, Math.floor(p.discount_price));
        } else {
          discountPct = Math.max(
            0,
            Math.min(99, Math.round((1 - unitPrice / listBaseUnit) * 100))
          );
        }
      }
      const minQ = Math.max(1, Math.floor(Number(p.min_order_qty)) || 1);
      const maxQ = Math.max(minQ, Math.floor(Number(p.max_order_qty)) || 99);
      const maxForCart = p.track_inventory ? Math.min(maxQ, p.stock_qty) : maxQ;
      if (maxForCart < minQ) return false;

      const lineInput: AddStoreCartLineInput = {
        storeId: store.id,
        storeSlug: store.slug,
        storeName: store.store_name,
        productId: p.id,
        title: p.title,
        thumbnailUrl: p.thumbnail_url?.trim() || null,
        qty: minQ,
        unitPricePhp: unitPrice,
        listUnitPricePhp: hasLineDiscount ? listBaseUnit : null,
        discountPercent: hasLineDiscount && discountPct != null && discountPct > 0 ? discountPct : null,
        optionSelections: {},
        modifierWire: { pick: {}, qty: {} },
        optionsSummary: "",
        lineNote: null,
        pickupAvailable: !!p.pickup_available,
        localDeliveryAvailable:
          !!p.local_delivery_available || store.delivery_available === true,
        shippingAvailable: !!p.shipping_available,
        minOrderQty: minQ,
        maxOrderQty: maxForCart,
      };

      const addResult = commerceCartActions.addOrMergeLine(lineInput);
      if (!addResult.ok && addResult.reason === "blocked_by_other_store") {
        dibayPerfRecordCartBlockedByOtherStore({
          existingStoreId: addResult.existingStoreId,
          nextStoreId: addResult.nextStoreId,
        });
        openStoreCartConflict(lineInput, storeCartConflictExistingFromBlockedAdd(addResult));
        return true;
      }
      if (!addResult.ok) return false;

      dibayPerfRecordAddToCartClick(store.id);
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
        event: "optimistic_quick_add",
        store_id: store.id,
        product_id: p.id,
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => dibayPerfOnCartbarUpdated(store.id));
      });
      showStoreDetailToast(store.id, t("store_added_to_cart_toast", { title: p.title }));
      return true;
    },
    [commerceCartActions, store, commerce, storeOrderability, t]
  );

  const onMenuSearchFocus = useCallback(() => {
    setMenuSearchOpen(true);
    const el = document.getElementById("store-menu-search");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      el?.focus();
      if (el && "select" in el && typeof (el as HTMLInputElement).select === "function") {
        (el as HTMLInputElement).select();
      }
    }, 280);
  }, []);

  const onFocusProductHandled = useCallback(() => {
    if (!focusProductId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("focusProduct")) return;
    url.searchParams.delete("focusProduct");
    const qs = url.searchParams.toString();
    router.replace(`${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`, { scroll: false });
  }, [focusProductId, router]);

  const armMenuScrollSpyLock = useCallback((sectionIndex: number, durationMs = 720) => {
    menuScrollSpyLockRef.current = {
      target: sectionIndex,
      until: performance.now() + durationMs,
    };
    setActiveMenuSection((prev) => (prev === sectionIndex ? prev : sectionIndex));
  }, []);

  const scrollStoreSectionIntoView = useCallback(
    (sectionIndex: number) => {
      if (typeof window === "undefined") return;
      const el = document.getElementById(`store-sec-${sectionIndex}`);
      const sticky = menuStickyMeasureRef.current;
      if (!el || !sticky) return;
      armMenuScrollSpyLock(sectionIndex);
      const scrollRoot = getStoreDetailAppScrollRoot();
      const stickyBottom = sticky.getBoundingClientRect().bottom;
      const sectionTop = el.getBoundingClientRect().top;
      const y = getStoreDetailScrollTop(scrollRoot) + (sectionTop - stickyBottom);
      setStoreDetailScrollTop(Math.max(0, y), { behavior: "smooth", scrollRoot });
    },
    [armMenuScrollSpyLock]
  );

  const onShareClick = useCallback(() => {
    if (typeof window === "undefined" || !store) return;
    const url = window.location.href;
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: store.store_name, text: store.store_name, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          window.alert(t("store_link_copied"));
        }
      } catch {
        /* 사용자 취소 등 */
      }
    })();
  }, [store]);

  const shellShareClick = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title =
      decodedSlug
        .replace(/-/g, " ")
        .trim() || t("store_fallback_name");
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title, text: title, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          window.alert(t("store_link_copied"));
        }
      } catch {
        /* noop */
      }
    })();
  }, [decodedSlug, t]);

  const noopCartPreviewClick = useCallback(() => {}, []);

  /** 매장 메뉴 탭 — 옵션 시트가 아니라 상품 상세(`/p/[id]`)로 이동. 카트 옵션 변경은 별도 모달. */
  const onOpenProductSheet = useCallback(
    (id: string) => {
      const st = storeRef.current;
      const productId = String(id ?? "").trim();
      if (!st || !productId) return;
      dibayDeliveryDetailPhase2Log("product_detail_nav", {
        slug: st.slug,
        product_id: productId,
        list_row_seed: productRowsByIdRef.current[productId] != null,
        ...dibayDeliveryDetailPhase2SinceMountOrNav(detailPhase2MountT0Ref.current),
      });
      router.push(
        `/stores/${encodeURIComponent(st.slug)}/p/${encodeURIComponent(productId)}`,
        { scroll: false }
      );
    },
    [router]
  );

  const sectionScrollMarginCss = useMemo(
    () =>
      `calc(env(safe-area-inset-top, 0px) + var(--delivery-header-h, 48px) + ${menuStickyStackPx}px + 10px)`,
    [menuStickyStackPx]
  );

  const storeTopNotices = useMemo(
    () => publicNotices.filter((n) => n.placement === "store_top"),
    [publicNotices]
  );
  const menuTopNotices = useMemo(
    () => publicNotices.filter((n) => n.placement === "menu_top"),
    [publicNotices]
  );
  const reviewTopNotices = useMemo(
    () => publicNotices.filter((n) => n.placement === "review_top"),
    [publicNotices]
  );

  const menuTopSlot = useMemo(() => {
    if (menuTopNotices.length === 0 || !storeForPaint?.slug) return undefined;
    const infoHrefBase = `/stores/${encodeURIComponent(storeForPaint.slug)}/info`;
    return <StoreOwnerNoticeCards notices={menuTopNotices} infoHrefBase={infoHrefBase} />;
  }, [menuTopNotices, storeForPaint?.slug]);

  /** 메인 컬럼(`APP_MAIN_COLUMN`) 폭에 맞춤 — 가로·태블릿에서 좌우 인공 보라 띠(430 고정) 제거 */
  const viewportShell = (inner: ReactNode, opts?: { anchorPaintGate?: boolean }) => (
    <div
      className={`w-full min-w-0 min-h-[100dvh] overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch]${
        opts?.anchorPaintGate && storeMenuRootActive && !menuTabsViewportReady ? " invisible" : ""
      }`}
    >
      {inner}
    </div>
  );

  if (summaryLoading && !storeForPaint && !transitionShellActive) {
    return viewportShell(
      <StoreDetailQuickShell
        slug={decodedSlug}
        fallbackHref={resolveStoreBrowseListHref({ storeSlug: decodedSlug })}
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={() => void toggleFavorite()}
        onMenuSearchFocus={() => {}}
        onShareClick={shellShareClick}
        onCartPreviewClick={() => {}}
      />
    );
  }

  if (!storeForPaint) {
    return viewportShell(
      <div className="px-4 py-12">
        <p className="text-center text-sm text-neutral-500">
          {dbOff
            ? t("store_db_not_configured")
            : t("store_not_found_short")}
        </p>
        <Link href="/stores" className="mt-4 block text-center text-sm font-medium text-sam-primary">
          {t("store_back_to_store_list")}
        </Link>
      </div>
    );
  }

  const detailStore = storeForPaint;

  const weekdaysLine = readWeekdaysLineFromJson(detailStore.business_hours_json);
  const deliveryMeta = parseStoreDeliveryMeta(detailStore.business_hours_json, weekdaysLine);
  const commerceExtras = parseCommerceExtrasFromHoursJson(detailStore.business_hours_json);
  const deliveryAvailable = detailStore.delivery_available === true;
  const pickupAvailable = detailStore.pickup_available !== false;

  const ownerOrderBlocked = storeOrderability.canOrderStore === false;
  const ownerOrderBlockedMessage = t("store_err_own_store_block");
  const menuSelectBlocked = ownerOrderBlocked || (commerce ? !commerce.isOpenForCommerce : false);
  const menuSelectHint =
    ownerOrderBlocked
      ? ownerOrderBlockedMessage
      : commerce && !commerce.isOpenForCommerce
        ? commerce.inBreak
          ? t("store_menu_blocked_break", { range: commerce.breakRangeLabel })
          : t("store_menu_blocked_hours")
        : undefined;

  const storeRootPath = `/stores/${encodeURIComponent(detailStore.slug)}`;
  const infoPath = `${storeRootPath}/info`;
  const browseListHref = resolveStoreBrowseListHrefFromStore(detailStore);
  const fallbackHref =
    pathname === infoPath || (pathname?.startsWith(`${infoPath}/`) ?? false)
      ? storeRootPath
      : browseListHref;

  const noticePreview =
    deliveryMeta.publicNotices.find((x) => String(x).trim())?.trim() ||
    deliveryMeta.deliveryNotice.trim() ||
    "";
  const storeGalleryUrls = parseMediaUrlsJson(detailStore.gallery_images_json, 8);
  const heroImageUrl = storeGalleryUrls[0] || null;
  const heroVisualForHeader =
    Boolean(String(heroImageUrl ?? "").trim()) || publicBanners.length > 0;
  const storeAddressLines = formatStorePickupAddressLines({
    region: detailStore.region,
    city: detailStore.city,
    district: detailStore.district,
    address_line1: detailStore.address_line1,
    address_line2: detailStore.address_line2,
  });
  const storeAddressLine = storeAddressLines.length > 0 ? storeAddressLines.join(" · ") : "";
  const la = typeof detailStore.lat === "number" ? detailStore.lat : Number(detailStore.lat);
  const ln = typeof detailStore.lng === "number" ? detailStore.lng : Number(detailStore.lng);
  const hasStoreCoords = Number.isFinite(la) && Number.isFinite(ln);
  const directionsQueryFallback =
    storeAddressLine.trim() ||
    [detailStore.address_line1, detailStore.address_line2]
      .map((x) => (typeof x === "string" ? x.replace(/\s*[\n\r]+\s*/g, ", ").trim() : ""))
      .filter(Boolean)
      .join(", ")
      .trim() ||
    null;
  const directions =
    hasStoreCoords || directionsQueryFallback
      ? {
          destinationCoords: hasStoreCoords ? { lat: la, lng: ln } : null,
          destinationQuery: hasStoreCoords ? null : directionsQueryFallback,
        }
      : null;

  return viewportShell(
    <StoreDetailCartChrome
      storeId={detailStore.id}
      slug={detailStore.slug}
      isOpen={isOpen}
      deliveryAvailable={deliveryAvailable}
      fulfillmentMode={fulfillmentMode}
      minOrderPhp={commerceExtras.minOrderPhp}
      closedDetail={
        commerce?.inBreak && commerce.breakConfigured ? commerce.breakRangeLabel : null
      }
    >
      <StoreDetailSummarySection
        headerElevated={headerSolid || !heroVisualForHeader}
        fallbackHref={fallbackHref}
        store={detailStore}
        heroImageUrl={heroImageUrl}
        recentOrderCount={recentOrderCountMeta}
        deliveryMeta={deliveryMeta}
        commerceExtras={commerceExtras}
        deliveryAvailable={deliveryAvailable}
        pickupAvailable={pickupAvailable}
        isOpenForOrder={isOpen}
        commerce={
          commerce
            ? {
                breakConfigured: commerce.breakConfigured,
                breakRangeLabel: commerce.breakRangeLabel,
                inBreak: commerce.inBreak,
              }
            : null
        }
        fulfillmentMode={fulfillmentMode}
        onFulfillmentChange={(mode) => writeStoreFulfillmentPref(detailStore.slug, mode)}
        ownerManagementHref={ownerManagementHref ?? undefined}
        infoPath={infoPath}
        reviewsHref={
          Math.max(0, Math.floor(Number(detailStore.review_count) || 0)) > 0
            ? `${storeRootPath}/reviews`
            : undefined
        }
        storeAddressLine={storeAddressLine || null}
        directions={directions}
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={() => void toggleFavorite()}
        onMenuSearchFocus={onMenuSearchFocus}
        onShareClick={onShareClick}
        onCartPreviewClick={noopCartPreviewClick}
        noticePreview={noticePreview}
        commerceCartStoreId={detailStore.id}
        bannersSlot={
          publicBanners.length > 0 ? (
            <StoreOwnerBannerCarousel storeSlug={detailStore.slug} banners={publicBanners} variant="hero" />
          ) : undefined
        }
        storeManagedNoticesSlot={
          storeTopNotices.length > 0 ? (
            <StoreOwnerNoticeCards notices={storeTopNotices} infoHrefBase={infoPath} />
          ) : undefined
        }
      />

      <StoreDetailMenusSection
        menusLoading={showMenusSkeleton}
        menuStickyMeasureRef={menuStickyMeasureRef}
        menuSearchOpen={menuSearchOpen}
        menuQuery={menuQuery}
        setMenuQuery={setMenuQuery}
        setMenuSearchOpen={setMenuSearchOpen}
        recommendedMenuCards={recommendedMenuCards}
        popularMenuCards={popularMenuCards}
        menuSectionsFiltered={menuSectionsFiltered}
        activeMenuSection={activeMenuSection}
        setActiveMenuSection={setActiveMenuSection}
        scrollStoreSectionIntoView={scrollStoreSectionIntoView}
        storeSlug={detailStore.slug}
        canSell={canSell}
        sectionScrollMarginCss={sectionScrollMarginCss}
        menuSelectBlocked={menuSelectBlocked}
        menuSelectHint={menuSelectHint}
        onOpenProductSheet={onOpenProductSheet}
        onQuickAddProduct={quickAddFromCard}
        onMenuFirstVisible={onMenuFirstVisible}
        commerceCartStoreId={isStoreDetailListSeedId(detailStore.id) ? undefined : detailStore.id}
        menuTopSlot={menuTopSlot}
        focusProductId={focusProductId}
        onFocusProductHandled={onFocusProductHandled}
        menuProductsForReviewRail={menuProductsForReviewRail}
        onOpenReviews={handleOpenReviewsPanel}
      />

      <StoreReviewsSlidePanel
        open={reviewsPanelOpen}
        storeSlug={detailStore.slug}
        options={reviewsPanelOptions}
        onRequestClose={handleCloseReviewsPanel}
      />

      <StoreDetailDeferredInfoSection
        storeSlug={detailStore.slug}
        storeRootPath={storeRootPath}
        legacyReviewCount={Math.max(0, Math.floor(Number(detailStore.review_count) || 0))}
        reviewTopSlot={
          reviewTopNotices.length > 0 ? (
            <StoreOwnerNoticeCards notices={reviewTopNotices} infoHrefBase={infoPath} />
          ) : undefined
        }
      />

      <div className="mt-6 px-4 pb-4 text-center">
        <Link
          href={`/stores/${encodeURIComponent(detailStore.slug)}/report`}
          className="text-[12px] font-normal text-neutral-400 underline underline-offset-2"
        >
          {t("store_report_store")}
        </Link>
      </div>

    </StoreDetailCartChrome>,
    { anchorPaintGate: true }
  );
}
