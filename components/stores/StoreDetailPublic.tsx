"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { MockStoreDetailView } from "@/components/stores/browse/MockStoreDetailView";
import { RestaurantMockDetailView } from "@/components/stores/delivery/RestaurantMockDetailView";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import { StoreDetailStorefrontPanel } from "@/components/stores/StoreDetailStorefrontPanel";
import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";
import { StoreProductAddSheet } from "@/components/stores/StoreProductAddSheet";
import { StorePublicMenuList } from "@/components/stores/StorePublicMenuList";
import { getBrowseMockStoreBySlug } from "@/lib/stores/browse-mock/queries";
import type { BrowseMockStore } from "@/lib/stores/browse-mock/types";
import { hasRestaurantDeliveryCatalog } from "@/lib/stores/delivery-mock/mock-restaurant-catalog";
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
  STORE_DETAIL_PAGE,
} from "@/lib/stores/store-detail-ui";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { parseStoreDeliveryMeta, readWeekdaysLineFromJson } from "@/lib/stores/store-detail-meta";
import { useOwnerManagementHref } from "@/lib/stores/use-owner-management-href";

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
  const commerceCart = useStoreCommerceCartOptional();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [products, setProducts] = useState<StoreDetailProductCard[]>([]);
  const [canSell, setCanSell] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbOff, setDbOff] = useState(false);
  const [browseMock, setBrowseMock] = useState<BrowseMockStore | null>(null);
  const [activeMenuSection, setActiveMenuSection] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [addSheetProductId, setAddSheetProductId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setOpenTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setLoading(true);
        setBrowseMock(null);
      }
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const json = await res.json();
        setDbOff(json?.meta?.source === "supabase_unconfigured");
        if (json?.ok && json.store) {
          setStore(json.store);
          setProducts(
            sortStoreDetailProductCardsForDisplay(
              Array.isArray(json.products) ? parseStoreDetailProducts(json.products) : []
            )
          );
          setCanSell(!!json.meta?.canSell);
        } else {
          if (!silent) {
            setStore(null);
            setProducts([]);
            setCanSell(false);
            const m = getBrowseMockStoreBySlug(slug);
            if (m) setBrowseMock(m);
          }
        }
      } catch {
        if (!silent) {
          setStore(null);
          setProducts([]);
          const m = getBrowseMockStoreBySlug(slug);
          if (m) setBrowseMock(m);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useRefetchOnPageShowRestore(() => void loadDetail({ silent: true }));

  const ownerManagementHref = useOwnerManagementHref(
    store ? { id: store.id, slug: store.slug } : null
  );

  const menuSections = useMemo(() => groupStoreProductsByMenuSection(products), [products]);

  useEffect(() => {
    setActiveMenuSection((i) =>
      menuSections.length === 0 ? 0 : Math.min(i, Math.max(0, menuSections.length - 1))
    );
  }, [menuSections.length]);

  const menuScrollOffsetPx = useMemo(() => {
    /* 상단 스티키(뒤로·로고·제목·통계 줄) 대략 높이 + 여백 */
    return 76 + 8;
  }, []);

  const scrollTicking = useRef(false);
  useEffect(() => {
    if (menuSections.length <= 1) return;
    const offset = menuScrollOffsetPx;
    const onScroll = () => {
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      window.requestAnimationFrame(() => {
        scrollTicking.current = false;
        const y = window.scrollY + offset;
        let best = 0;
        menuSections.forEach((_, i) => {
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
  }, [menuSections, menuScrollOffsetPx]);

  const commerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open);
  }, [store, openTick]);

  const isOpen = commerce?.isOpenForCommerce ?? true;

  if (loading) {
    return (
      <div className={STORE_DETAIL_PAGE}>
        <p className="py-12 text-center text-sm text-stone-500">불러오는 중…</p>
      </div>
    );
  }

  if (browseMock) {
    if (browseMock.primarySlug === "restaurant" && hasRestaurantDeliveryCatalog(browseMock.slug)) {
      return <RestaurantMockDetailView store={browseMock} />;
    }
    return <MockStoreDetailView store={browseMock} />;
  }

  if (!store) {
    return (
      <div className={STORE_DETAIL_PAGE}>
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-stone-600">
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

      <div id="store-menu-panel" className="bg-[#f3f4f6] pb-4">
        <StoreMenuCategoryChips
          sections={menuSections.map((s) => ({ label: s.heading }))}
          activeIndex={activeMenuSection}
          omitTopBorder
          onSelect={(i) => {
            setActiveMenuSection(i);
            document.getElementById(`store-sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <StorePublicMenuList
          storeSlug={store.slug}
          sections={menuSections}
          canSell={canSell}
          sectionDomId={(i) => `store-sec-${i}`}
          sectionScrollMarginTopPx={menuScrollOffsetPx}
          menuSelectBlocked={menuSelectBlocked}
          menuSelectHint={menuSelectHint}
          onOpenProduct={(id) => setAddSheetProductId(id)}
          orderHint={
            canSell && products.length > 0 ? (
              <>
                메뉴를 눌러 옵션·수량을 고른 뒤 장바구니에 담으세요. 하단 장바구니에서 주문하면 매장으로 전달되고, 사장님 주문 관리에서 접수·처리됩니다.{" "}
                <Link
                  href={`/stores/${encodeURIComponent(store.slug)}/cart`}
                  className="font-medium text-signature underline decoration-signature/30"
                >
                  장바구니
                </Link>
                {" · "}
                <Link
                  href="/mypage/store-orders"
                  className="font-medium text-signature underline decoration-signature/30"
                >
                  주문 내역
                </Link>
              </>
            ) : undefined
          }
        />
      </div>

      <div className={`${STORE_DETAIL_GUTTER} mt-6 text-center`}>
        <Link
          href={`/stores/${encodeURIComponent(store.slug)}/report`}
          className="text-[12px] font-normal text-stone-400 underline decoration-stone-300 underline-offset-2"
        >
          매장 신고
        </Link>
      </div>

      <StoreDetailBottomStrip
        slug={store.slug}
        isOpen={isOpen}
        deliveryAvailable={deliveryAvailable}
        cartTotalPhp={cartSubtotalThisStore}
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
      />
    </div>
  );
}
