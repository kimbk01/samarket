"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";
import { StoreMenuReviewFlowLink } from "@/components/stores/StoreMenuReviewFlowLink";
import { StoreProductAddSheet } from "@/components/stores/StoreProductAddSheet";
import { StorePublicMenuList } from "@/components/stores/StorePublicMenuList";
import { StoreCartPreviewSheet } from "@/components/stores/store-order-detail/StoreCartPreviewSheet";
import { StoreDetailOrderSkeleton } from "@/components/stores/store-order-detail/StoreDetailOrderSkeleton";
import { StoreOrderHeroSummary } from "@/components/stores/store-order-detail/StoreOrderHeroSummary";
import { StoreOrderNoticeStrip } from "@/components/stores/store-order-detail/StoreOrderNoticeStrip";
import { StoreOrderStickyHeader } from "@/components/stores/store-order-detail/StoreOrderStickyHeader";
import {
  groupStoreProductsByMenuSection,
  parseStoreDetailProducts,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import {
  STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
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
  fetchStorePublicBySlugDeduped,
  primeStorePublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";
import {
  getStorePublicInitialSnapshot,
  storePublicProductRowsMap,
} from "@/lib/stores/store-public-page-hydrate";

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
  const router = useRouter();
  const pathname = usePathname();
  const commerceCart = useStoreCommerceCartOptional();
  const decodedSlug = useMemo(() => decodeSlugSegment(slug), [slug]);

  const initialSnap = useMemo(
    () => getStorePublicInitialSnapshot(initialApiResponse),
    [initialApiResponse]
  );

  const [store, setStore] = useState<StoreDetail | null>(() => initialSnap.store as StoreDetail | null);
  const [products, setProducts] = useState<StoreDetailProductCard[]>(() => initialSnap.products);
  const [productRowsById, setProductRowsById] = useState<Record<string, Record<string, unknown>>>(
    () => initialSnap.productRowsById
  );
  const [canSell, setCanSell] = useState(() => initialSnap.canSell);
  const [loading, setLoading] = useState(() => initialSnap.loading);
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

  const scrollHeaderGate = useRef(false);
  const menuStickyMeasureRef = useRef<HTMLDivElement>(null);
  const [menuStickyStackPx, setMenuStickyStackPx] = useState(118);

  const { viewerFavorited, favoriteBusy, toggleFavorite } = useStoreFavoriteToggle(
    decodedSlug,
    favoriteSeed
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
        a.is_featured !== b.is_featured
      ) {
        return false;
      }
    }
    return true;
  };

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

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);
      try {
        const { json } = await fetchStorePublicBySlugDeduped(slug);
        const j = json as {
          ok?: boolean;
          store?: StoreDetail & { lat?: number | null; lng?: number | null; created_at?: string };
          products?: unknown;
          meta?: {
            source?: string;
            canSell?: boolean;
            viewer_favorited?: boolean;
            favorite_count?: unknown;
            recent_order_count?: unknown;
          };
        };
        const nextDbOff = j?.meta?.source === "supabase_unconfigured";
        setDbOff((prev) => (prev === nextDbOff ? prev : nextDbOff));
        if (j?.ok && j.store) {
          const nextStore = {
            ...j.store,
            lat: j.store.lat ?? null,
            lng: j.store.lng ?? null,
          };
          const nextProducts = sortStoreDetailProductCardsForDisplay(
            Array.isArray(j.products) ? parseStoreDetailProducts(j.products) : []
          );
          const nextCanSell = !!j.meta?.canSell;
          setStore((prev) => (isSameStoreDetail(prev, nextStore) ? prev : nextStore));
          setProducts((prev) => (isSameProductCards(prev, nextProducts) ? prev : nextProducts));
          setCanSell((prev) => (prev === nextCanSell ? prev : nextCanSell));
          setFavoriteSeed({
            viewerFavorited: !!j.meta?.viewer_favorited,
            favoriteCount: Number(j.meta?.favorite_count) || 0,
          });
          setRecentOrderCountMeta(Number(j.meta?.recent_order_count) || 0);
          setProductRowsById(storePublicProductRowsMap(j.products));
        } else if (!silent) {
          setStore(null);
          setProducts([]);
          setCanSell(false);
          setProductRowsById({});
        }
      } catch {
        if (!silent) {
          setStore(null);
          setProducts([]);
          setCanSell(false);
          setProductRowsById({});
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug]
  );

  useLayoutEffect(() => {
    if (initialApiResponse?.status === 200) {
      primeStorePublicCache(slug, initialApiResponse);
    }
    void loadDetail();
  }, [slug, loadDetail, initialApiResponse]);

  useRefetchOnPageShowRestore(() => void loadDetail({ silent: true }));

  useEffect(() => {
    const onScroll = () => {
      if (scrollHeaderGate.current) return;
      scrollHeaderGate.current = true;
      window.requestAnimationFrame(() => {
        scrollHeaderGate.current = false;
        const y = window.scrollY;
        setHeaderSolid((prev) => {
          const next = y > 52;
          return prev === next ? prev : next;
        });
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const ownerManagementHref = useOwnerManagementHref(
    store ? { id: store.id, slug: store.slug } : null
  );

  const menuSections = useMemo(() => groupStoreProductsByMenuSection(products), [products]);

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
    if (loading || !store) return;
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
  }, [loading, store?.id, menuQuery]);

  const quickAddFromCard = useCallback(
    (p: StoreDetailProductCard): boolean => {
      if (!commerceCart?.hydrated || !store || p.has_options) return false;
      if (commerce ? !commerce.isOpenForCommerce : false) return false;
      const soldOut = p.track_inventory && p.stock_qty <= 0;
      if (soldOut) return false;
      const others = commerceCart.otherBucketsExcluding(store.id);
      if (others.length > 0) {
        const o = others[0];
        window.alert(
          `다른 매장의 상품이 있습니다.\n${o.storeName} 장바구니를 주문하거나 비운 뒤 이 매장에서 담을 수 있어요.`
        );
        router.push(`/stores/${encodeURIComponent(o.storeSlug)}/cart`);
        return true;
      }
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

      commerceCart.addOrMergeLine({
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
      });
      setToastMsg(`${p.title} 담았어요`);
      return true;
    },
    [commerceCart, store, commerce, router]
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

  const sectionScrollMarginCss = useMemo(
    () =>
      `calc(env(safe-area-inset-top, 0px) + 56px + ${menuStickyStackPx}px + 10px)`,
    [menuStickyStackPx]
  );

  /** 메인 컬럼(`APP_MAIN_COLUMN`) 폭에 맞춤 — 가로·태블릿에서 좌우 인공 보라 띠(430 고정) 제거 */
  const viewportShell = (inner: ReactNode) => (
    <div className="w-full min-w-0 min-h-[100dvh] overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch]">
      {inner}
    </div>
  );

  if (loading) {
    return viewportShell(<StoreDetailOrderSkeleton />);
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
  const storeAddressLine = [
    store.region,
    store.city,
    store.district,
    store.address_line1,
    store.address_line2,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return viewportShell(
    <div className={`pb-[env(safe-area-inset-bottom,0px)] ${rootBottomPadClass}`}>
      <StoreOrderStickyHeader
        elevated={headerSolid}
        fallbackHref={fallbackHref}
        storeSlug={store.slug}
        storeName={store.store_name}
        commerceCartStoreId={store.id}
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={() => void toggleFavorite()}
        onMenuSearchFocus={onMenuSearchFocus}
        onShareClick={onShareClick}
        onCartPreviewClick={() => setCartPreviewOpen(true)}
      />

      <div>
        <StoreOrderHeroSummary
          storeName={store.store_name}
          profileImageUrl={heroImageUrl}
          ratingAvg={
            store.rating_avg != null && Number.isFinite(Number(store.rating_avg))
              ? Number(store.rating_avg)
              : null
          }
          reviewCount={Number(store.review_count) || 0}
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
          storeInfoHref={infoPath}
          reviewsHref={
            Math.max(0, Math.floor(Number(store.review_count) || 0)) > 0
              ? `${storeRootPath}/reviews`
              : undefined
          }
          addressLine={storeAddressLine || null}
          viewerFavorited={viewerFavorited}
          favoriteBusy={favoriteBusy}
          onFavoriteClick={() => void toggleFavorite()}
        />
      </div>

      {noticePreview ? (
        <StoreOrderNoticeStrip
          text={noticePreview}
          href={infoPath}
          storeName={store.store_name}
          showCouponBadge={false}
        />
      ) : null}

      <div id="store-menu-panel">
        <div
          ref={menuStickyMeasureRef}
          className="sticky z-[40] border-b border-neutral-100 bg-white"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 56px)",
          }}
        >
          <label className="sr-only" htmlFor="store-menu-search">
            메뉴 검색
          </label>
          {menuSearchOpen ? (
            <div className="px-5 pb-2 pt-2">
              <div className="flex h-[42px] items-center gap-2 rounded-full bg-[#F5F6F7] px-4">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  id="store-menu-search"
                  type="search"
                  enterKeyHint="search"
                  placeholder="메뉴명을 검색해보세요"
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMenuQuery("");
                    setMenuSearchOpen(false);
                  }}
                  className="text-[13px] font-bold text-neutral-500"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}
          <StoreMenuCategoryChips
            variant="orderDetail"
            sections={menuSectionsFiltered.map((s) => ({ label: s.heading }))}
            activeIndex={activeMenuSection}
            omitTopBorder
            plainBackground
            showSearchButton
            onSearchClick={() => {
              setMenuSearchOpen(true);
              window.setTimeout(() => document.getElementById("store-menu-search")?.focus(), 0);
            }}
            onSelect={(i) => {
              setActiveMenuSection(i);
              scrollStoreSectionIntoView(i);
            }}
          />
        </div>

        <StoreMenuReviewFlowLink
          storeSlug={store.slug}
          reviewCount={Number(store.review_count) || 0}
          ratingAvg={
            store.rating_avg != null && Number.isFinite(Number(store.rating_avg))
              ? Number(store.rating_avg)
              : null
          }
        />

        <StorePublicMenuList
          storeSlug={store.slug}
          sections={menuSectionsFiltered}
          canSell={canSell}
          sectionDomId={(i) => `store-sec-${i}`}
          sectionScrollMarginCss={sectionScrollMarginCss}
          menuSelectBlocked={menuSelectBlocked}
          menuSelectHint={menuSelectHint}
          onOpenProduct={(id) => setAddSheetProductId(id)}
          onQuickAddProduct={quickAddFromCard}
        />
      </div>

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
    </div>
  );
}
