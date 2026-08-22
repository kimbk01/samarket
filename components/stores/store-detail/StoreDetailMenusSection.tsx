"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode, RefObject } from "react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  clearStoreMenuProductFocusRing,
  isStoreMenuProductFocusLandingAligned,
  isStoreMenuSectionHeaderLandingAligned,
  measureStoreMenuProductFocusDeltaPx,
  resolveStoreMenuFocusStickyBottomPx,
  scrollStoreMenuFocusEntryIntoView,
  storeMenuProductDomId,
} from "@/lib/dibay/store-menu-product-focus";
import { isStoreMenuFocusStickyGeometryReady } from "@/lib/dibay/store-menu-focus-entry";
import { findMenuSectionIndexForProduct } from "@/lib/stores/group-store-products-by-menu";
import { deliveryMenuVisibleMarkFirstSectionReady } from "@/lib/dibay/delivery-menu-visible-trace";
import { markMenusColdFillFirstInteractable } from "@/lib/stores/menus-cold-fill-deep-breakdown";
import type { StoreMenuBoardListHandle } from "@/components/stores/detail/StoreMenuBoardList";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { CategoryStickyTabs } from "@/components/stores/detail/CategoryStickyTabs";
import { useStoreDetailCategoryTabsPin } from "@/lib/stores/use-store-detail-category-tabs-pin";
import { storeDetailCategoryTabsStickyTopCss } from "@/lib/ui/store-detail-menu-tabs-viewport";
import { PopularMenuSection } from "@/components/stores/detail/PopularMenuSection";
import { RecommendedMenuSection } from "@/components/stores/detail/RecommendedMenuSection";
import { StoreMenuBoardList } from "@/components/stores/detail/StoreMenuBoardList";
import type { MenuSection, StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { StoreDetailMenusSkeleton } from "@/components/stores/store-detail/StoreDetailMenusSkeleton";
import { useMenuSubtreeCartStabilityGuard } from "@/components/stores/detail/use-menu-subtree-cart-stability-guard";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import type { StoreReviewsPanelOpenOptions } from "@/lib/stores/store-reviews-panel-open";
import { StoreMenuReviewFlowLink, type StoreMenuReviewRailProduct } from "@/components/stores/StoreMenuReviewFlowLink";
import {
  DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY,
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { useDeliverySurfaceLifecycle } from "@/components/delivery/presentation/DeliverySurfaceLifecycle";
import { deliveryPresentationMarkEvent } from "@/lib/dibay/delivery-presentation-evidence";

export const StoreDetailMenusSection = memo(function StoreDetailMenusSection({
  menusLoading,
  menuStickyMeasureRef,
  menuSearchOpen,
  menuQuery,
  setMenuQuery,
  setMenuSearchOpen,
  recommendedMenuCards,
  popularMenuCards,
  menuSectionsFiltered,
  activeMenuSection,
  setActiveMenuSection,
  scrollStoreSectionIntoView,
  storeSlug,
  canSell,
  sectionScrollMarginCss,
  menuSelectBlocked,
  menuSelectHint,
  onOpenProductSheet,
  onQuickAddProduct,
  onMenuFirstVisible,
  menuTopSlot,
  commerceCartStoreId,
  focusProductId,
  onFocusProductHandled,
  onFocusEntryReady,
  onFocusEntryScrollSpyLock,
  focusEntryPreparing = false,
  menuProductsForReviewRail,
  onOpenReviews,
}: {
  menusLoading: boolean;
  menuStickyMeasureRef: RefObject<HTMLDivElement | null>;
  menuSearchOpen: boolean;
  menuQuery: string;
  setMenuQuery: (v: string) => void;
  setMenuSearchOpen: (v: boolean) => void;
  recommendedMenuCards: StoreDetailProductCard[];
  popularMenuCards: StoreDetailProductCard[];
  menuSectionsFiltered: MenuSection[];
  activeMenuSection: number;
  setActiveMenuSection: (i: number | ((p: number) => number)) => void;
  scrollStoreSectionIntoView: (sectionIndex: number) => void;
  storeSlug: string;
  canSell: boolean;
  sectionScrollMarginCss: string;
  menuSelectBlocked: boolean;
  menuSelectHint?: string;
  onOpenProductSheet: (id: string) => void;
  onQuickAddProduct: (p: StoreDetailProductCard) => boolean;
  onMenuFirstVisible?: (source: string) => void;
  menuTopSlot?: ReactNode;
  commerceCartStoreId?: string;
  /** browse·검색 등 — 해당 상품 행으로 스크롤 */
  focusProductId?: string | null;
  onFocusProductHandled?: () => void;
  /** PREPARING 해제 — 첫 노출 = 최종 정렬 frame */
  onFocusEntryReady?: () => void;
  /** focus land 동안 scroll spy 고정 */
  onFocusEntryScrollSpyLock?: (sectionIndex: number) => void;
  focusEntryPreparing?: boolean;
  menuProductsForReviewRail?: StoreMenuReviewRailProduct[];
  onOpenReviews: (opts?: StoreReviewsPanelOpenOptions) => void;
}) {
  const storeLifecycle = useDeliverySurfaceLifecycle("store");
  const storeActive = storeLifecycle === "active";
  const canInteract = canSell && !menuSelectBlocked;
  const menuBoardRef = useRef<StoreMenuBoardListHandle>(null);
  const tabsSentinelRef = useRef<HTMLDivElement>(null);
  const { pinned, tabsHeightPx } = useStoreDetailCategoryTabsPin({
    sentinelRef: tabsSentinelRef,
    tabsRef: menuStickyMeasureRef,
    enabled: storeActive,
  });
  const firstSectionReadyRef = useRef(false);
  const firstVisibleRef = useRef(false);
  const firstInteractableRef = useRef(false);
  const focusHandledRef = useRef<string | null>(null);
  /** strip 후에도 spacer 유지 — 제거 시 scrollMax clamp 로 landing 재이탈 */
  const [retainFocusScrollSpacer, setRetainFocusScrollSpacer] = useState(false);
  /** product당 scroll 1회 — effect 재진입 시 재 scroll 금지 */
  const focusScrollCommittedRef = useRef<string | null>(null);
  const focusTargetReadyMarkedRef = useRef<string | null>(null);
  const focusRingProductIdRef = useRef<string | null>(null);

  useEffect(() => {
    focusHandledRef.current = null;
    focusScrollCommittedRef.current = null;
    focusTargetReadyMarkedRef.current = null;
  }, [focusProductId]);

  useEffect(() => {
    if (focusProductId) {
      focusRingProductIdRef.current = focusProductId;
      setRetainFocusScrollSpacer(true);
    }
  }, [focusProductId]);

  useEffect(() => {
    if (storeActive) return;
    clearStoreMenuProductFocusRing(focusRingProductIdRef.current);
    focusRingProductIdRef.current = null;
  }, [storeActive]);

  /**
   * focusProduct entry — 단일 scroll authority.
   * PREPARING 동안만 position 확정(최대 1회 auto). reveal 이후·effect 재진입 correction 금지.
   * geometry PASS 전에 URL strip 금지.
   */
  useLayoutEffect(() => {
    const productId = focusProductId?.trim();
    if (!storeActive || !productId || menusLoading) return;
    if (focusHandledRef.current === productId) return;

    const sectionIndex = findMenuSectionIndexForProduct(menuSectionsFiltered, productId);
    if (sectionIndex < 0) {
      // menus still empty / not yet grouped — wait; only abort when menus settled without product
      if (!menusLoading && menuSectionsFiltered.length > 0) {
        focusHandledRef.current = productId;
        onFocusEntryReady?.();
        onFocusProductHandled?.();
      }
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let framesWaited = 0;
    const maxWaitFrames = 180;

    const stickyBottomNow = () => {
      const tabsEl = menuStickyMeasureRef.current;
      const measuredTabsH = tabsEl
        ? Math.round(tabsEl.getBoundingClientRect().height)
        : 0;
      const tabsH = Math.max(tabsHeightPx, measuredTabsH, 48);
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      const fallback = resolveStoreMenuFocusStickyBottomPx({
        tabsEl: null,
        tabsHeightPx: tabsH,
        pinned: false,
        viewportHeightPx: vh,
      });
      const live = tabsEl?.getBoundingClientRect().bottom ?? 0;
      // Pinned tabs sit near the header — reject in-flow bottoms still mid-page
      if (live > 0 && vh > 0 && live < vh && live <= fallback + 32) return live;
      return fallback;
    };

    const stickyForLand = () => {
      const tabsEl = menuStickyMeasureRef.current;
      const measuredTabsH = tabsEl
        ? Math.round(tabsEl.getBoundingClientRect().height)
        : 0;
      const tabsH = Math.max(tabsHeightPx, measuredTabsH, 48);
      return resolveStoreMenuFocusStickyBottomPx({
        tabsEl: null,
        tabsHeightPx: tabsH,
        pinned: false,
        viewportHeightPx: typeof window !== "undefined" ? window.innerHeight : 0,
      });
    };

    const productReady = (): HTMLElement | null => {
      const lastIdx = Math.max(0, menuSectionsFiltered.length - 1);
      menuBoardRef.current?.ensureSectionsHydratedThrough(lastIdx);
      if (!menuBoardRef.current?.isSectionHydrated(lastIdx)) return null;
      if (!menuBoardRef.current?.isSectionHydrated(sectionIndex)) return null;
      const spacer = document.querySelector("[data-store-menu-focus-scroll-spacer]");
      if (!spacer) return null;
      if (spacer.getBoundingClientRect().height < 64) return null;
      const el = document.getElementById(storeMenuProductDomId(productId));
      if (!el) return null;
      if (!(el.getBoundingClientRect().height > 0)) return null;
      if (focusTargetReadyMarkedRef.current !== productId) {
        focusTargetReadyMarkedRef.current = productId;
        deliveryPresentationMarkEvent("focusTargetReady", { productId });
      }
      return el;
    };

    const landOnce = (): boolean => {
      const tabsEl = menuStickyMeasureRef.current;
      const measuredTabsH = tabsEl
        ? Math.round(tabsEl.getBoundingClientRect().height)
        : 0;
      if (!(measuredTabsH >= 40 || tabsHeightPx >= 40)) return false;
      const sticky = stickyForLand();
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      if (!isStoreMenuFocusStickyGeometryReady(sticky, vh)) return false;
      const landed = scrollStoreMenuFocusEntryIntoView(sectionIndex, productId, sticky, {
        behavior: "auto",
      });
      if (landed) {
        deliveryPresentationMarkEvent("focusLand", { productId, sectionIndex });
      }
      return landed;
    };

    const finish = () => {
      const sticky = stickyBottomNow();
      deliveryPresentationMarkEvent("focusFinal", {
        productId,
        deltaPx: measureStoreMenuProductFocusDeltaPx(productId, sticky),
      });
      focusHandledRef.current = productId;
      onFocusEntryReady?.();
      onFocusProductHandled?.();
    };

    const tryFinishIfAligned = (): boolean => {
      const sticky = stickyBottomNow();
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      if (!isStoreMenuFocusStickyGeometryReady(sticky, vh)) return false;
      const productAligned = isStoreMenuProductFocusLandingAligned(productId, sticky);
      const sectionAligned = isStoreMenuSectionHeaderLandingAligned(sectionIndex, sticky);
      if (!productAligned && !sectionAligned) return false;
      finish();
      return true;
    };

    const tick = () => {
      if (cancelled) return;
      onFocusEntryScrollSpyLock?.(sectionIndex);
      setActiveMenuSection(sectionIndex);
      const el = productReady();
      if (!el) {
        framesWaited += 1;
        if (framesWaited >= maxWaitFrames) {
          if (focusScrollCommittedRef.current !== productId) {
            landOnce();
            focusScrollCommittedRef.current = productId;
          }
          tryFinishIfAligned();
          return;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      const sticky = stickyBottomNow();
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      if (!isStoreMenuFocusStickyGeometryReady(sticky, vh)) {
        framesWaited += 1;
        if (framesWaited >= maxWaitFrames) {
          if (focusScrollCommittedRef.current !== productId) {
            landOnce();
            focusScrollCommittedRef.current = productId;
          }
          tryFinishIfAligned();
          return;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (focusScrollCommittedRef.current !== productId) {
        focusScrollCommittedRef.current = productId;
        if (!landOnce()) {
          focusScrollCommittedRef.current = null;
          framesWaited += 1;
          if (framesWaited >= maxWaitFrames) {
            tryFinishIfAligned();
            return;
          }
          rafId = requestAnimationFrame(tick);
          return;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (tryFinishIfAligned()) {
        return;
      }

      framesWaited += 1;
      if (framesWaited >= maxWaitFrames) {
        tryFinishIfAligned();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    storeActive,
    focusProductId,
    menusLoading,
    menuSectionsFiltered,
    menuStickyMeasureRef,
    setActiveMenuSection,
    onFocusProductHandled,
    onFocusEntryReady,
    onFocusEntryScrollSpyLock,
    tabsHeightPx,
  ]);

  useMenuSubtreeCartStabilityGuard(commerceCartStoreId);

  useLayoutEffect(() => {
    if (
      firstInteractableRef.current ||
      menusLoading ||
      !canInteract ||
      menuSectionsFiltered.length === 0
    ) {
      return;
    }
    firstInteractableRef.current = true;
    markMenusColdFillFirstInteractable(storeSlug);
  }, [menusLoading, canInteract, menuSectionsFiltered.length, storeSlug]);

  useLayoutEffect(() => {
    const sheetProductId = useStoreProductSheetUIStore.getState().productId;
    deliveryRenderTraceBump("menu-section", {
      store_slug: storeSlug,
      sheet_open: sheetProductId != null,
      ...(sheetProductId ? { sheet_product_id: sheetProductId } : {}),
    });
    if (deliveryPerfTraceEnabled() && sheetProductId) {
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY, {
        event: "render_while_sheet_open",
        event_key: `menu_while_sheet:${storeSlug}:${sheetProductId}`,
        surface: "menu-section",
        store_slug: storeSlug,
        product_id: sheetProductId,
      });
    }
  }, [storeSlug]);

  const reportFirstVisible = (source: string) => {
    if (firstVisibleRef.current) return;
    if (
      !menusLoading &&
      menuSectionsFiltered.length > 0 &&
      !firstSectionReadyRef.current
    ) {
      firstSectionReadyRef.current = true;
      deliveryMenuVisibleMarkFirstSectionReady(storeSlug, menuSectionsFiltered.length);
    }
    firstVisibleRef.current = true;
    onMenuFirstVisible?.(source);
  };

  const popularRankById = useMemo(() => {
    const m = new Map<string, number>();
    popularMenuCards.forEach((c, i) => {
      m.set(c.id, c.popular_rank ?? i + 1);
    });
    return m;
  }, [popularMenuCards]);

  const recommendedForUi = useMemo(
    () =>
      recommendedMenuCards.map((c) => ({
        ...c,
        popular_rank: popularRankById.get(c.id) ?? c.popular_rank ?? null,
      })),
    [recommendedMenuCards, popularRankById]
  );

  const stickyTop = storeDetailCategoryTabsStickyTopCss();
  const focusHydrateThroughIndex = useMemo(() => {
    const id = focusProductId?.trim();
    if (!id || !focusEntryPreparing) return null;
    const idx = findMenuSectionIndexForProduct(menuSectionsFiltered, id);
    return idx >= 0 ? idx : null;
  }, [focusProductId, focusEntryPreparing, menuSectionsFiltered]);
  const showFocusScrollSpacer =
    Boolean(focusProductId) || retainFocusScrollSpacer || focusEntryPreparing;
  const focusScrollSpacerCss = showFocusScrollSpacer
    ? `calc(100dvh - (var(--safe-top, 0px) + var(--delivery-header-h, 48px) + ${Math.max(tabsHeightPx, 48)}px))`
    : null;

  return (
    <div id="store-menu-panel" data-store-focus-entry-preparing={focusEntryPreparing ? "true" : "false"}>
      {!menusLoading && storeSlug ? (
        <StoreMenuReviewFlowLink
          storeSlug={storeSlug}
          menuProducts={menuProductsForReviewRail ?? []}
          onOpenReviews={onOpenReviews}
        />
      ) : null}
      <div
        id="store-menu-tabs-sentinel"
        ref={tabsSentinelRef}
        className="h-px w-full shrink-0"
        aria-hidden
      />
      {pinned ? <div className="w-full shrink-0" style={{ height: tabsHeightPx }} aria-hidden /> : null}
      <CategoryStickyTabs
        measureRef={menuStickyMeasureRef}
        sections={menuSectionsFiltered.map((s) => ({ label: s.heading }))}
        activeIndex={activeMenuSection}
        menuSearchOpen={menuSearchOpen}
        menuQuery={menuQuery}
        setMenuQuery={setMenuQuery}
        setMenuSearchOpen={setMenuSearchOpen}
        stickyTopCss={stickyTop}
        pinned={pinned}
        onSelect={(i) => {
          menuBoardRef.current?.ensureSectionsHydratedThrough(i);
          setActiveMenuSection(i);
          scrollStoreSectionIntoView(i);
        }}
      />

      {!menusLoading ? (
        <>
          <PopularMenuSection
            cards={popularMenuCards}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProductSheet}
            onQuickAddProduct={onQuickAddProduct}
          />
          <RecommendedMenuSection
            cards={recommendedForUi}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProductSheet}
            onQuickAddProduct={onQuickAddProduct}
          />
        </>
      ) : null}

      {menuTopSlot ? (
        <div className="border-b border-neutral-100 bg-white px-4 pb-2 pt-1">{menuTopSlot}</div>
      ) : null}

      {menusLoading ? (
        <StoreDetailMenusSkeleton />
      ) : (
        <>
          <StoreMenuBoardList
            ref={menuBoardRef}
            storeSlug={storeSlug}
            sections={menuSectionsFiltered}
            canSell={canSell}
            menuSelectBlocked={menuSelectBlocked}
            menuSelectHint={menuSelectHint}
            sectionDomId={(i) => `store-sec-${i}`}
            sectionScrollMarginCss={sectionScrollMarginCss}
            onOpenProduct={onOpenProductSheet}
            onQuickAddProduct={onQuickAddProduct}
            onFirstCategoryProductPaint={
              onMenuFirstVisible
                ? () => reportFirstVisible("first_category_card")
                : undefined
            }
            forceHydrateThroughIndex={focusHydrateThroughIndex}
          />
          {focusScrollSpacerCss ?
            <div
              aria-hidden
              data-store-menu-focus-scroll-spacer
              style={{ height: focusScrollSpacerCss }}
            />
          : null}
        </>
      )}
    </div>
  );
});
