"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import {
  StoreDetailStorefrontPanel,
  type StorePublicFulfillmentMode,
} from "@/components/stores/StoreDetailStorefrontPanel";
import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";
import { StoreProductAddSheet } from "@/components/stores/StoreProductAddSheet";
import { StorePublicMenuList } from "@/components/stores/StorePublicMenuList";
import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import {
  groupStoreProductsByMenuSection,
  parseStoreDetailProducts,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  STORE_DETAIL_GUTTER,
  STORE_DETAIL_MENU_STICKY_TOP_CLASS,
  STORE_DETAIL_PAGE,
} from "@/lib/stores/store-detail-ui";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import {
  readStoreFulfillmentPref,
  writeStoreFulfillmentPref,
  STORE_FULFILLMENT_PREF_CHANGED_EVENT,
  type StoreFulfillmentPrefChangedDetail,
} from "@/lib/stores/store-fulfillment-pref";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { parseStoreDeliveryMeta, readWeekdaysLineFromJson } from "@/lib/stores/store-detail-meta";
import { useOwnerManagementHref } from "@/lib/stores/use-owner-management-href";
import { fetchStorePublicBySlugDeduped } from "@/lib/stores/store-delivery-api-client";

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
  profile_image_url: string | null;
  gallery_images_json: unknown;
  is_open: boolean | null;
  business_hours_json: unknown;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  updated_at?: string;
};

export function StoreDetailPublic({ slug }: { slug: string }) {
  const router = useRouter();
  const commerceCart = useStoreCommerceCartOptional();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [products, setProducts] = useState<StoreDetailProductCard[]>([]);
  const [canSell, setCanSell] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbOff, setDbOff] = useState(false);
  const [activeMenuSection, setActiveMenuSection] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [addSheetProductId, setAddSheetProductId] = useState<string | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [fulfillmentMode, setFulfillmentMode] = useState<StorePublicFulfillmentMode>("pickup");
  const [activeTab, setActiveTab] = useState<"menu" | "review">("menu");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setOpenTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const id = window.setTimeout(() => setToastMsg(null), 2400);
    return () => window.clearTimeout(id);
  }, [toastMsg]);

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setLoading(true);
      }
      try {
        const { json } = await fetchStorePublicBySlugDeduped(slug);
        const j = json as {
          ok?: boolean;
          store?: StoreDetail;
          products?: unknown;
          meta?: { source?: string; canSell?: boolean };
        };
        setDbOff(j?.meta?.source === "supabase_unconfigured");
        if (j?.ok && j.store) {
          setStore(j.store);
          setProducts(
            sortStoreDetailProductCardsForDisplay(
              Array.isArray(j.products) ? parseStoreDetailProducts(j.products) : []
            )
          );
          setCanSell(!!j.meta?.canSell);
        } else {
          if (!silent) {
            setStore(null);
            setProducts([]);
            setCanSell(false);
          }
        }
      } catch {
        if (!silent) {
          setStore(null);
          setProducts([]);
          setCanSell(false);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug]
  );

  useLayoutEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useRefetchOnPageShowRestore(() => void loadDetail({ silent: true }));

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

  /** `STORE_DETAIL_MENU_STICKY_TOP_CLASS` 의 top 오프셋( safe-area 제외 본문 기준 )과 맞춤 */
  const TIER1_ORDER_HEADER_PX = 104;
  const [menuStickyHeightPx, setMenuStickyHeightPx] = useState(108);
  const menuStickyMeasureRef = useRef<HTMLDivElement>(null);
  const menuScrollOffsetPx = TIER1_ORDER_HEADER_PX + menuStickyHeightPx + 12;

  useEffect(() => {
    if (!store?.slug || typeof window === "undefined") return;
    const v = readStoreFulfillmentPref(store.slug);
    if (v) setFulfillmentMode(v);
  }, [store?.slug]);

  useEffect(() => {
    const slug = store?.slug?.trim();
    if (!slug) return;
    const h = (e: Event) => {
      const d = (e as CustomEvent<StoreFulfillmentPrefChangedDetail>).detail;
      if (!d?.slug) return;
      if (d.slug.trim() === slug || d.slug.trim().toLowerCase() === slug.toLowerCase()) {
        setFulfillmentMode(d.mode);
      }
    };
    window.addEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, h);
    return () => window.removeEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, h);
  }, [store?.slug]);

  const scrollTicking = useRef(false);
  useEffect(() => {
    if (menuSectionsFiltered.length <= 1) return;
    const offset = menuScrollOffsetPx;
    const onScroll = () => {
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      window.requestAnimationFrame(() => {
        scrollTicking.current = false;
        const y = window.scrollY + offset;
        let best = 0;
        menuSectionsFiltered.forEach((_, i) => {
          const el = document.getElementById(`store-sec-${i}`);
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (top <= y + 8) best = i;
        });
        setActiveMenuSection(best);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [menuSectionsFiltered, menuScrollOffsetPx]);

  const commerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open);
  }, [store, openTick]);

  const isOpen = commerce?.isOpenForCommerce ?? true;

  useEffect(() => {
    if (!store) return;
    const dA = store.delivery_available === true;
    const pA = store.pickup_available !== false;
    const slug = store.slug;
    if (fulfillmentMode === "local_delivery" && !dA) {
      setFulfillmentMode("pickup");
      writeStoreFulfillmentPref(slug, "pickup");
    } else if (fulfillmentMode === "pickup" && !pA && dA) {
      setFulfillmentMode("local_delivery");
      writeStoreFulfillmentPref(slug, "local_delivery");
    }
  }, [store, fulfillmentMode]);

  useEffect(() => {
    if (loading || !store) return;
    const el = menuStickyMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setMenuStickyHeightPx((prev) => {
        const h = Math.max(48, Math.ceil(el.getBoundingClientRect().height));
        return prev === h ? prev : h;
      });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, store?.id]);

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
        /* `StoreProductAddSheet` addToCart 와 동일 규칙 */
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

  if (loading) {
    return (
      <div className={STORE_DETAIL_PAGE}>
        <p className="py-12 text-center text-sm text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className={STORE_DETAIL_PAGE}>
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-sam-muted">
            {dbOff
              ? "Supabase가 연결되지 않았거나 매장 테이블이 없습니다. SQL 마이그레이션을 적용해 주세요."
              : "매장을 찾을 수 없습니다."}
          </p>
          <Link href="/stores" className="mt-4 inline-block text-sm font-medium text-signature">
            매장 목록으로
          </Link>
        </div>
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

  const menuSelectBlocked = commerce ? !commerce.isOpenForCommerce : false;
  const menuSelectHint =
    commerce && !commerce.isOpenForCommerce
      ? commerce.inBreak
        ? `준비중 · Break time: ${commerce.breakRangeLabel}. 쉬는 시간에는 메뉴를 선택할 수 없습니다.`
        : "지금은 영업 시간이 아니어서 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."
      : undefined;

  const storeInfoHref = `/stores/${encodeURIComponent(store.slug)}/info`;

  return (
    <div className={`${STORE_DETAIL_PAGE} ${STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS}`}>
      <StoreDetailStorefrontPanel
        deliveryMeta={deliveryMeta}
        commerceExtras={commerceExtras}
        deliveryAvailable={deliveryAvailable}
        pickupAvailable={pickupAvailable}
        isOpen={isOpen}
        commerce={
          commerce
            ? {
                breakConfigured: commerce.breakConfigured,
                breakRangeLabel: commerce.breakRangeLabel,
                inBreak: commerce.inBreak,
              }
            : null
        }
        ownerManagementHref={ownerManagementHref}
        storeInfoHref={storeInfoHref}
      />

      <div id="store-menu-panel" className="bg-sam-app pb-4">
        <div
          ref={menuStickyMeasureRef}
          className={`sticky z-[33] border-b border-sam-border/90 bg-sam-app/95 px-3 py-2 backdrop-blur-md ${STORE_DETAIL_MENU_STICKY_TOP_CLASS}`}
        >
          <div className="mb-2 grid grid-cols-2 gap-2 rounded-ui-rect bg-sam-surface p-1">
            <button
              type="button"
              onClick={() => setActiveTab("menu")}
              className={`rounded-ui-rect px-3 py-2 sam-text-body font-semibold ${
                activeTab === "menu" ? "bg-signature text-white" : "text-sam-fg"
              }`}
            >
              메뉴
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("review")}
              className={`rounded-ui-rect px-3 py-2 sam-text-body font-semibold ${
                activeTab === "review" ? "bg-signature text-white" : "text-sam-fg"
              }`}
            >
              리뷰
            </button>
          </div>
          {activeTab === "menu" ? (
            <>
              <label className="sr-only" htmlFor="store-menu-search">
                메뉴 검색
              </label>
              <input
                id="store-menu-search"
                type="search"
                enterKeyHint="search"
                placeholder="메뉴 검색"
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                className="mb-2 w-full rounded-full border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body text-sam-fg shadow-sm outline-none ring-signature/20 placeholder:text-sam-meta focus:ring-2"
              />
              <StoreMenuCategoryChips
                sections={menuSectionsFiltered.map((s) => ({ label: s.heading }))}
                activeIndex={activeMenuSection}
                omitTopBorder
                plainBackground
                onSelect={(i) => {
                  setActiveMenuSection(i);
                  document.getElementById(`store-sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </>
          ) : null}
        </div>
        {activeTab === "menu" ? (
          <StorePublicMenuList
            storeSlug={store.slug}
            sections={menuSectionsFiltered}
            canSell={canSell}
            sectionDomId={(i) => `store-sec-${i}`}
            sectionScrollMarginTopPx={menuScrollOffsetPx}
            menuSelectBlocked={menuSelectBlocked}
            menuSelectHint={menuSelectHint}
            onOpenProduct={(id) => setAddSheetProductId(id)}
            onQuickAddProduct={quickAddFromCard}
          />
        ) : (
          <StoreReviewsSection storeSlug={store.slug} variant="plain" />
        )}
      </div>

      <div className={`${STORE_DETAIL_GUTTER} mt-6 text-center`}>
        <Link
          href={`/stores/${encodeURIComponent(store.slug)}/report`}
          className="sam-text-helper font-normal text-sam-meta underline decoration-sam-meta underline-offset-2"
        >
          매장 신고
        </Link>
      </div>

      <StoreDetailBottomStrip
        slug={store.slug}
        isOpen={isOpen}
        deliveryAvailable={deliveryAvailable}
        fulfillmentMode={fulfillmentMode}
        cartTotalPhp={cartSubtotalThisStore}
        cartQtyTotal={cartQtyThisStore}
        minOrderPhp={commerceExtras.minOrderPhp}
        closedDetail={
          commerce?.inBreak && commerce.breakConfigured
            ? `Break time: ${commerce.breakRangeLabel}`
            : null
        }
      />

      <StoreProductAddSheet
        productId={addSheetProductId}
        pageStoreSlug={store.slug}
        onClose={() => setAddSheetProductId(null)}
        commerceBlocked={menuSelectBlocked}
        commerceBlockedHint={menuSelectHint}
        onAddedToCart={() => setToastMsg("장바구니에 담았어요")}
      />

      {toastMsg ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[32] max-w-[min(92vw,20rem)] -translate-x-1/2 rounded-ui-rect bg-sam-ink/92 px-4 py-2.5 text-center sam-text-body-secondary font-semibold text-white shadow-sam-elevated"
          style={{ bottom: "max(88px, calc(env(safe-area-inset-bottom, 0px) + 72px))" }}
          role="status"
        >
          {toastMsg}
        </div>
      ) : null}
    </div>
  );
}
