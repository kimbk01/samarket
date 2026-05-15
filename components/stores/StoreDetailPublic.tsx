"use client";

import type { ReactNode } from "react";
import { StoreOwnerBannerCarousel } from "@/components/stores/StoreOwnerBannerCarousel";
import { StoreOwnerNoticeCards } from "@/components/stores/StoreOwnerNoticeCards";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  useStoreCommerceCartOptional,
} from "@/contexts/StoreCommerceCartContext";
import { StoreCartOtherStoreConflictDialog } from "@/components/stores/StoreCartOtherStoreConflictDialog";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import { StoreProductAddSheet } from "@/components/stores/StoreProductAddSheet";
import { StoreCartPreviewSheet } from "@/components/stores/store-order-detail/StoreCartPreviewSheet";
import { StoreDetailQuickShell } from "@/components/stores/StoreDetailQuickShell";
import { StoreDetailDeferredInfoSection } from "@/components/stores/store-detail/StoreDetailDeferredInfoSection";
import { StoreDetailMenusSection } from "@/components/stores/store-detail/StoreDetailMenusSection";
import { StoreDetailSummarySection } from "@/components/stores/store-detail/StoreDetailSummarySection";
import {
  buildRecommendedStripProductIds,
  groupStoreProductsByMenuSectionModel,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import {
  STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import {
  readStoreFulfillmentPref,
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
  primeStorePublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";
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
  dibayPerfRecordCartReplaceConfirm,
  dibayPerfRecordCartReplaceDone,
  dibayPerfRecordMenuItemOpenIntent,
} from "@/lib/dibay/delivery-flow-perf";

type StoreDetail = {
  id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
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
  const pathname = usePathname();
  const commerceCart = useStoreCommerceCartOptional();
  const decodedSlug = useMemo(() => decodeSlugSegment(slug), [slug]);

  const initialSnap = useMemo(
    () => getStorePublicInitialSnapshot(initialApiResponse),
    [initialApiResponse]
  );

  const [store, setStore] = useState<StoreDetail | null>(() => initialSnap.store as StoreDetail | null);
  const [products, setProducts] = useState(() => initialSnap.products);
  const [recommendedMenuCards, setRecommendedMenuCards] = useState<StoreDetailProductCard[]>([]);
  const [popularMenuCards, setPopularMenuCards] = useState<StoreDetailProductCard[]>([]);
  const [productRowsById, setProductRowsById] = useState<Record<string, Record<string, unknown>>>(
    () => initialSnap.productRowsById
  );
  const [canSell, setCanSell] = useState(() => initialSnap.canSell);
  const [summaryLoading, setSummaryLoading] = useState(() => initialSnap.loading);
  const [menusLoading, setMenusLoading] = useState(() => initialSnap.loading);
  const [dbOff, setDbOff] = useState(() => initialSnap.dbOff);
  const [activeMenuSection, setActiveMenuSection] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [addSheetProductId, setAddSheetProductId] = useState<string | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<StorePublicFulfillmentMode>("pickup");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [headerSolid, setHeaderSolid] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [favoriteSeed, setFavoriteSeed] = useState(() => initialSnap.favoriteSeed);
  const [recentOrderCountMeta, setRecentOrderCountMeta] = useState(() => initialSnap.recentOrderCountMeta);
  const [quickCartConflictOpen, setQuickCartConflictOpen] = useState(false);
  const pendingQuickCartLineRef = useRef<AddStoreCartLineInput | null>(null);
  const [publicBanners, setPublicBanners] = useState<StoreBannerPublicRow[]>([]);
  const [publicNotices, setPublicNotices] = useState<StoreNoticePublicRow[]>([]);
  const [menuSoldOutBottom, setMenuSoldOutBottom] = useState(false);

  const scrollHeaderGate = useRef(false);
  const menuStickyMeasureRef = useRef<HTMLDivElement>(null);
  const [menuStickyStackPx, setMenuStickyStackPx] = useState(118);
  const shellMarkedSlugRef = useRef<string | null>(null);
  const menuMarkedStoreIdRef = useRef<string | null>(null);
  const storeIdRef = useRef<string | null>(null);
  /** 비동기 `loadSplitDetail*` 완료 시점에 URL slug 가 바뀌었는지 판별 */
  const latestSlugPropRef = useRef(slug);
  latestSlugPropRef.current = slug;

  useEffect(() => {
    storeIdRef.current = store?.id ?? null;
  }, [store?.id]);

  const { viewerFavorited, favoriteBusy, toggleFavorite } = useStoreFavoriteToggle(
    decodedSlug,
    favoriteSeed
  );

  useLayoutEffect(() => {
    if (!store || summaryLoading) return;
    if (shellMarkedSlugRef.current === decodedSlug) return;
    shellMarkedSlugRef.current = decodedSlug;
    dibayPerfOnStoreDetailShellVisible({ slug: decodedSlug });
  }, [store, summaryLoading, decodedSlug]);

  useLayoutEffect(() => {
    if (!store?.id || menusLoading) return;
    if (menuMarkedStoreIdRef.current === store.id) return;
    menuMarkedStoreIdRef.current = store.id;
    dibayPerfOnStoreMenuVisible({ slug: store.slug, storeId: store.id });
  }, [store?.id, store?.slug, menusLoading]);

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
      setFavoriteSeed({ viewerFavorited: false, favoriteCount: 0 });
      setRecentOrderCountMeta(0);
      setMenuSoldOutBottom(false);
    }
  }, []);

  const applySummaryPayload = useCallback((sumParsed: StoreSummaryPayload) => {
    if (!sumParsed.store) return;
    const nextStore = {
      ...sumParsed.store,
      lat: sumParsed.store.lat ?? null,
      lng: sumParsed.store.lng ?? null,
    } as StoreDetail;
    setStore((prev) => (isSameStoreDetail(prev, nextStore) ? prev : nextStore));
    setFavoriteSeed({
      viewerFavorited: !!sumParsed.meta?.viewer_favorited,
      favoriteCount: Number(sumParsed.meta?.favorite_count) || 0,
    });
    setRecentOrderCountMeta(Number(sumParsed.meta?.recent_order_count) || 0);
    setDbOff(false);
  }, []);

  const applyMenusPayload = useCallback((menuParsed: StoreMenusPayload) => {
    const raw = menuParsed.products ?? [];
    const nextProducts = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(raw));
    setProductRowsById(storePublicProductRowsMap(raw));
    const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];
    const stripCap = Math.min(
      RECOMMENDED_MENU_STRIP_MAX,
      Math.max(
        1,
        Math.floor(Number(menuParsed.meta?.popular_menu?.recommended_max)) || RECOMMENDED_MENU_STRIP_MAX
      )
    );
    const recIds =
      Array.isArray(menuParsed.recommendedProductIds) && menuParsed.recommendedProductIds.length > 0
        ? menuParsed.recommendedProductIds
        : buildRecommendedStripProductIds(popIds, nextProducts, stripCap);

    const byId = new Map(nextProducts.map((c) => [c.id, c]));

    const nextPop = popIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c, i) => ({ ...(c as StoreDetailProductCard), popular_rank: i + 1 }));

    const popularRankById = new Map(nextPop.map((c) => [c.id, c.popular_rank ?? 0]));
    const nextProductsRanked = nextProducts.map((p) => {
      const r = popularRankById.get(p.id);
      return r != null && r > 0 ? { ...p, popular_rank: r } : { ...p, popular_rank: p.popular_rank ?? null };
    });

    setProducts((prev) => (isSameProductCards(prev, nextProductsRanked) ? prev : nextProductsRanked));

    const byIdRanked = new Map(nextProductsRanked.map((c) => [c.id, c]));

    const nextRec = recIds
      .map((id) => {
        const c = byIdRanked.get(id);
        if (!c) return null;
        const r = popularRankById.get(id);
        return r != null && r > 0 ? { ...c, popular_rank: r } : { ...c, popular_rank: c.popular_rank ?? null };
      })
      .filter(Boolean) as StoreDetailProductCard[];

    setRecommendedMenuCards((prev) => {
      if (
        prev.length === nextRec.length &&
        prev.every((p, i) => p.id === nextRec[i]?.id && p.sort_order === nextRec[i]?.sort_order)
      ) {
        return prev;
      }
      return nextRec;
    });
    setPopularMenuCards((prev) => {
      if (
        prev.length === nextPop.length &&
        prev.every(
          (p, i) =>
            p.id === nextPop[i]?.id && (p.popular_rank ?? 0) === (nextPop[i]?.popular_rank ?? 0)
        )
      ) {
        return prev;
      }
      return nextPop;
    });
    setCanSell((prev) => {
      const next = !!menuParsed.meta?.canSell;
      return prev === next ? prev : next;
    });
    setFavoriteSeed({
      viewerFavorited: !!menuParsed.meta?.viewer_favorited,
      favoriteCount: Number(menuParsed.meta?.favorite_count) || 0,
    });
    setRecentOrderCountMeta(Number(menuParsed.meta?.recent_order_count) || 0);
    const sob =
      menuParsed.meta?.menu_sold_out_bottom === true ||
      menuParsed.store?.menu_sold_out_bottom === true;
    setMenuSoldOutBottom((prev) => (prev === sob ? prev : sob));
  }, []);

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
    } else if (h.store) {
      applyLegacyHydrate(json);
    } else {
      setProducts([]);
      setRecommendedMenuCards([]);
      setPopularMenuCards([]);
      setProductRowsById({});
      setCanSell(false);
      setMenuSoldOutBottom(false);
    }
  }, [applyLegacyHydrate]);

  const loadSplitDetail = useCallback(async () => {
    const startedSlugDecode = decodeSlugSegment(slug);
    setSummaryLoading(true);
    setMenusLoading(true);
    setDbOff(false);

    const sumRes = await fetchStoreSummaryDeduped(slug);

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

    const [menuRes, banRes, notRes] = await Promise.all([
      fetchStoreMenusDeduped(slug),
      fetchStoreBannersDeduped(slug),
      fetchStoreNoticesDeduped(slug),
    ]);

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
      setSummaryLoading(false);
      setMenusLoading(false);
      return;
    }

    const banJ = banRes.json as { ok?: boolean; banners?: StoreBannerPublicRow[] };
    const notJ = notRes.json as { ok?: boolean; notices?: StoreNoticePublicRow[] };
    setPublicBanners(banRes.status === 200 && banJ?.ok && Array.isArray(banJ.banners) ? banJ.banners : []);
    setPublicNotices(notRes.status === 200 && notJ?.ok && Array.isArray(notJ.notices) ? notJ.notices : []);

    const menuParsed = parseStoreMenusPayload(menuRes.json);
    const menusReady =
      menuRes.status === 200 &&
      menuParsed.ok === true &&
      menuParsed.meta?.source !== "supabase_unconfigured" &&
      Array.isArray(menuParsed.products);

    applySummaryPayload(sumParsed);
    if (menusReady) {
      applyMenusPayload(menuParsed);
    } else {
      try {
        const leg = await fetchStorePublicBySlugDeduped(slug);
        if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) {
          setSummaryLoading(false);
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
    }
    setSummaryLoading(false);
    setMenusLoading(false);
  }, [slug, applyLegacyHydrate, applyMenusPayload, applySummaryPayload, mergeLegacyProductsOnly]);

  const loadSplitDetailSilent = useCallback(async () => {
    const startedSlugDecode = decodeSlugSegment(slug);

    const sumRes = await fetchStoreSummaryDeduped(slug);

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

    const [menuRes, banRes, notRes] = await Promise.all([
      fetchStoreMenusDeduped(slug),
      fetchStoreBannersDeduped(slug),
      fetchStoreNoticesDeduped(slug),
    ]);

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;

    const banJ = banRes.json as { ok?: boolean; banners?: StoreBannerPublicRow[] };
    const notJ = notRes.json as { ok?: boolean; notices?: StoreNoticePublicRow[] };
    setPublicBanners(banRes.status === 200 && banJ?.ok && Array.isArray(banJ.banners) ? banJ.banners : []);
    setPublicNotices(notRes.status === 200 && notJ?.ok && Array.isArray(notJ.notices) ? notJ.notices : []);

    const menuParsed = parseStoreMenusPayload(menuRes.json);
    const menusReady =
      menuRes.status === 200 &&
      menuParsed.ok === true &&
      menuParsed.meta?.source !== "supabase_unconfigured" &&
      Array.isArray(menuParsed.products);

    if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;

    applySummaryPayload(sumParsed);
    if (menusReady) {
      applyMenusPayload(menuParsed);
      return;
    }

    try {
      const leg = await fetchStorePublicBySlugDeduped(slug);
      if (decodeSlugSegment(latestSlugPropRef.current) !== startedSlugDecode) return;
      mergeLegacyProductsOnly(leg.json);
    } catch {
      /* noop */
    }
  }, [slug, applyLegacyHydrate, applyMenusPayload, applySummaryPayload, mergeLegacyProductsOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setOpenTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const id = window.setTimeout(() => setToastMsg(null), 2400);
    return () => window.clearTimeout(id);
  }, [toastMsg]);

  useLayoutEffect(() => {
    if (initialApiResponse?.status === 200) {
      primeStorePublicCache(slug, initialApiResponse);
    }
    void loadSplitDetail();
  }, [slug, loadSplitDetail, initialApiResponse]);

  useRefetchOnPageShowRestore(() => void loadSplitDetailSilent());

  useEffect(() => {
    const onScroll = () => {
      if (scrollHeaderGate.current) return;
      scrollHeaderGate.current = true;
      window.requestAnimationFrame(() => {
        scrollHeaderGate.current = false;
        setHeaderSolid((prev) => {
          // 히어로(커버·배너) 하단이 헤더(약 56px) 아래로 지나가면 → 흰 배경 + 검은 아이콘
          const hero = document.getElementById("store-hero-media");
          const headerH = 56; // h-14
          const next = hero ? hero.getBoundingClientRect().bottom <= headerH : true;
          return prev === next ? prev : next;
        });
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [publicBanners.length, store?.slug]);

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
    if (!q) return menuSections;
    return menuSections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            (p.summary && p.summary.toLowerCase().includes(q))
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [menuSections, menuQuery]);

  useEffect(() => {
    setActiveMenuSection((i) =>
      menuSectionsFiltered.length === 0 ? 0 : Math.min(i, Math.max(0, menuSectionsFiltered.length - 1))
    );
  }, [menuSectionsFiltered.length]);

  useEffect(() => {
    if (!store?.slug || typeof window === "undefined") return;
    const v = readStoreFulfillmentPref(store.slug);
    if (v) setFulfillmentMode(v);
  }, [store?.slug]);

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

  const scrollTicking = useRef(false);
  useEffect(() => {
    if (menuSectionsFiltered.length <= 1) return;
    const onScroll = () => {
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      window.requestAnimationFrame(() => {
        scrollTicking.current = false;
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
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [menuSectionsFiltered]);

  const commerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open);
  }, [store, openTick]);

  const isOpen = commerce?.isOpenForCommerce ?? true;

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
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [summaryLoading, menusLoading, store?.id, menuQuery]);

  const cancelQuickCartConflict = useCallback(() => {
    pendingQuickCartLineRef.current = null;
    setQuickCartConflictOpen(false);
  }, []);

  const confirmQuickCartReplace = useCallback(() => {
    const line = pendingQuickCartLineRef.current;
    if (!line || !commerceCart) return;
    dibayPerfRecordCartReplaceConfirm({ storeId: line.storeId });
    dibayPerfRecordAddToCartClick(line.storeId);
    const r = commerceCart.replaceWithLine(line);
    dibayPerfRecordCartReplaceDone({ storeId: line.storeId });
    pendingQuickCartLineRef.current = null;
    setQuickCartConflictOpen(false);
    if (!r.ok) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => dibayPerfOnCartbarUpdated(line.storeId));
    });
    setToastMsg(`${line.title} 담았어요`);
  }, [commerceCart]);

  const quickAddFromCard = useCallback(
    (p: StoreDetailProductCard): boolean => {
      if (!commerceCart?.hydrated || !store || p.has_options) return false;
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

      const addResult = commerceCart.addOrMergeLine(lineInput);
      if (!addResult.ok && addResult.reason === "blocked_by_other_store") {
        dibayPerfRecordCartBlockedByOtherStore({
          existingStoreId: addResult.existingStoreId,
          nextStoreId: addResult.nextStoreId,
        });
        pendingQuickCartLineRef.current = lineInput;
        setQuickCartConflictOpen(true);
        return true;
      }
      if (!addResult.ok) return false;

      dibayPerfRecordAddToCartClick(store.id);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => dibayPerfOnCartbarUpdated(store.id));
      });
      setToastMsg(`${p.title} 담았어요`);
      return true;
    },
    [commerceCart, store, commerce]
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

  const scrollStoreSectionIntoView = useCallback((sectionIndex: number) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(`store-sec-${sectionIndex}`);
    const sticky = menuStickyMeasureRef.current;
    if (!el || !sticky) return;
    const stickyBottom = sticky.getBoundingClientRect().bottom;
    const sectionTop = el.getBoundingClientRect().top;
    const y = window.scrollY + (sectionTop - stickyBottom);
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, []);

  const onShareClick = useCallback(() => {
    if (typeof window === "undefined" || !store) return;
    const url = window.location.href;
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: store.store_name, text: store.store_name, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          window.alert("링크를 복사했습니다.");
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
        .trim() || "매장";
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title, text: title, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          window.alert("링크를 복사했습니다.");
        }
      } catch {
        /* noop */
      }
    })();
  }, [decodedSlug]);

  const onOpenProductSheet = useCallback((id: string) => {
    dibayPerfRecordMenuItemOpenIntent();
    setAddSheetProductId(id);
  }, []);

  const sectionScrollMarginCss = useMemo(
    () =>
      `calc(env(safe-area-inset-top, 0px) + 56px + ${menuStickyStackPx}px + 10px)`,
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

  /** 메인 컬럼(`APP_MAIN_COLUMN`) 폭에 맞춤 — 가로·태블릿에서 좌우 인공 보라 띠(430 고정) 제거 */
  const viewportShell = (inner: ReactNode) => (
    <div className="w-full min-w-0 min-h-[100dvh] overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch]">
      {inner}
    </div>
  );

  if (summaryLoading && !store) {
    return viewportShell(
      <StoreDetailQuickShell
        slug={decodedSlug}
        fallbackHref="/stores"
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={() => void toggleFavorite()}
        onMenuSearchFocus={() => {}}
        onShareClick={shellShareClick}
        onCartPreviewClick={() => {}}
      />
    );
  }

  if (!store) {
    return viewportShell(
      <div className="px-4 py-12">
        <p className="text-center text-sm text-neutral-500">
          {dbOff
            ? "Supabase가 연결되지 않았거나 매장 테이블이 없습니다. SQL 마이그레이션을 적용해 주세요."
            : "매장을 찾을 수 없습니다."}
        </p>
        <Link href="/stores" className="mt-4 block text-center text-sm font-medium text-[#1C8DB8]">
          매장 목록으로
        </Link>
      </div>
    );
  }

  const weekdaysLine = readWeekdaysLineFromJson(store.business_hours_json);
  const deliveryMeta = parseStoreDeliveryMeta(store.business_hours_json, weekdaysLine);
  const commerceExtras = parseCommerceExtrasFromHoursJson(store.business_hours_json);
  const deliveryAvailable = store.delivery_available === true;
  const pickupAvailable = store.pickup_available !== false;

  const cartSubtotalThisStore =
    commerceCart?.hydrated ? commerceCart.getSubtotalForStoreId(store.id) : 0;
  const cartQtyThisStore =
    commerceCart?.hydrated ? commerceCart.getTotalQtyForStoreId(store.id) : 0;
  const cartLineKindCount =
    commerceCart?.hydrated ? commerceCart.getItemCountForStoreId(store.id) : 0;

  const rootBottomPadClass =
    cartQtyThisStore > 0
      ? STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS
      : STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS;

  const menuSelectBlocked = commerce ? !commerce.isOpenForCommerce : false;
  const menuSelectHint =
    commerce && !commerce.isOpenForCommerce
      ? commerce.inBreak
        ? `준비중 · Break time: ${commerce.breakRangeLabel}. 쉬는 시간에는 메뉴를 선택할 수 없습니다.`
        : "지금은 영업 시간이 아니어서 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."
      : undefined;

  const storeRootPath = `/stores/${encodeURIComponent(store.slug)}`;
  const infoPath = `${storeRootPath}/info`;
  const fallbackHref =
    pathname === infoPath || (pathname?.startsWith(`${infoPath}/`) ?? false)
      ? storeRootPath
      : "/stores";

  const noticePreview =
    deliveryMeta.publicNotices.find((x) => String(x).trim())?.trim() ||
    deliveryMeta.deliveryNotice.trim() ||
    "";
  const storeGalleryUrls = parseMediaUrlsJson(store.gallery_images_json, 8);
  const heroImageUrl = storeGalleryUrls[0] || store.profile_image_url;
  const heroVisualForHeader =
    Boolean(String(heroImageUrl ?? "").trim()) || publicBanners.length > 0;
  const storeAddressLines = formatStorePickupAddressLines({
    region: store.region,
    city: store.city,
    district: store.district,
    address_line1: store.address_line1,
    address_line2: store.address_line2,
  });
  const storeAddressLine = storeAddressLines.length > 0 ? storeAddressLines.join(" · ") : "";
  const la = typeof store.lat === "number" ? store.lat : Number(store.lat);
  const ln = typeof store.lng === "number" ? store.lng : Number(store.lng);
  const hasStoreCoords = Number.isFinite(la) && Number.isFinite(ln);
  const directionsQueryFallback =
    storeAddressLine.trim() ||
    [store.address_line1, store.address_line2]
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
    <div className={`pb-[env(safe-area-inset-bottom,0px)] ${rootBottomPadClass}`}>
      <StoreDetailSummarySection
        headerElevated={headerSolid || !heroVisualForHeader}
        fallbackHref={fallbackHref}
        store={store}
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
        onFulfillmentChange={(mode) => writeStoreFulfillmentPref(store.slug, mode)}
        ownerManagementHref={ownerManagementHref ?? undefined}
        infoPath={infoPath}
        reviewsHref={
          Math.max(0, Math.floor(Number(store.review_count) || 0)) > 0
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
        onCartPreviewClick={() => setCartPreviewOpen(true)}
        noticePreview={noticePreview}
        commerceCartStoreId={store.id}
        bannersSlot={
          publicBanners.length > 0 ? (
            <StoreOwnerBannerCarousel storeSlug={store.slug} banners={publicBanners} variant="hero" />
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
        storeSlug={store.slug}
        canSell={canSell}
        sectionScrollMarginCss={sectionScrollMarginCss}
        menuSelectBlocked={menuSelectBlocked}
        menuSelectHint={menuSelectHint}
        onOpenProductSheet={onOpenProductSheet}
        onQuickAddProduct={quickAddFromCard}
        menuTopSlot={
          menuTopNotices.length > 0 ? (
            <StoreOwnerNoticeCards notices={menuTopNotices} infoHrefBase={infoPath} />
          ) : undefined
        }
      />

      <StoreDetailDeferredInfoSection
        storeSlug={store.slug}
        storeRootPath={storeRootPath}
        legacyReviewCount={Math.max(0, Math.floor(Number(store.review_count) || 0))}
        reviewTopSlot={
          reviewTopNotices.length > 0 ? (
            <StoreOwnerNoticeCards notices={reviewTopNotices} infoHrefBase={infoPath} />
          ) : undefined
        }
      />

      <div className="mt-6 px-4 pb-4 text-center">
        <Link
          href={`/stores/${encodeURIComponent(store.slug)}/report`}
          className="text-[12px] font-normal text-neutral-400 underline underline-offset-2"
        >
          매장 신고
        </Link>
      </div>

      {addSheetProductId ? null : (
        <StoreDetailBottomStrip
          slug={store.slug}
          isOpen={isOpen}
          deliveryAvailable={deliveryAvailable}
          fulfillmentMode={fulfillmentMode}
          cartTotalPhp={cartSubtotalThisStore}
          cartQtyTotal={cartQtyThisStore}
          cartLineKindCount={cartLineKindCount}
          minOrderPhp={commerceExtras.minOrderPhp}
          closedDetail={
            commerce?.inBreak && commerce.breakConfigured
              ? `Break time: ${commerce.breakRangeLabel}`
              : null
          }
          onCartPreviewOpen={() => setCartPreviewOpen(true)}
        />
      )}

      <StoreCartPreviewSheet
        open={cartPreviewOpen}
        onClose={() => setCartPreviewOpen(false)}
        storeId={store.id}
        storeSlug={store.slug}
      />

      <StoreProductAddSheet
        productId={addSheetProductId}
        pageStoreSlug={store.slug}
        prefetchedListRow={
          addSheetProductId ? productRowsById[addSheetProductId] ?? null : null
        }
        sheetStoreContext={{
          store,
          favoriteCount: favoriteSeed.favoriteCount,
          recentOrderCount: recentOrderCountMeta,
        }}
        onClose={() => setAddSheetProductId(null)}
        commerceBlocked={menuSelectBlocked}
        commerceBlockedHint={menuSelectHint}
        onAddedToCart={() => setToastMsg("장바구니에 담았어요")}
      />

      {toastMsg ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[90] max-w-[min(92vw,20rem)] -translate-x-1/2 rounded-[12px] bg-neutral-900/92 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg"
          style={{
            bottom:
              cartQtyThisStore > 0
                ? "max(96px, calc(env(safe-area-inset-bottom, 0px) + 88px))"
                : "max(88px, calc(env(safe-area-inset-bottom, 0px) + 72px))",
          }}
          role="status"
        >
          {toastMsg}
        </div>
      ) : null}

      <StoreCartOtherStoreConflictDialog
        open={quickCartConflictOpen}
        onCancel={cancelQuickCartConflict}
        onClearAndAdd={confirmQuickCartReplace}
      />
    </div>
  );
}
