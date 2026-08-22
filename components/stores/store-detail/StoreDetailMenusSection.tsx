"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode, RefObject } from "react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyStoreMenuProductFocusRing,
  clearStoreMenuProductFocusRing,
  storeMenuProductDomId,
  storeMenuSectionDomId,
} from "@/lib/dibay/store-menu-product-focus";
import {
  beginFeaturedEntryScrollPrepare,
  dispatchFeaturedEntryReady,
  endFeaturedEntryScrollPrepare,
  isFeaturedEntryFinalPinnedLayoutProvenForWrite,
  isFeaturedEntryLandGeometryStable,
  isFeaturedEntryLandGeometryVerified,
  measureFeaturedEntryLandGeometry,
  measureStoreDetailElementScrollTop,
  resolveFeaturedEntryFinalStickyBottomPx,
  writeFeaturedEntryScrollForCategoryHeader,
} from "@/lib/dibay/featured-entry-position-authority";
import { getMainAppScrollRoot, getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
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
import type { StoreChromePortalTarget } from "@/lib/dibay/delivery-store-chrome-portal-contract";

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
  onFeaturedEntryPositionReady,
  focusEntryPreparing = false,
  chromePortalTarget,
  featuredSoftHosted = false,
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
  /** offscreen prepare 완료 — presentation slide 게이트 */
  onFeaturedEntryPositionReady?: () => void;
  focusEntryPreparing?: boolean;
  chromePortalTarget?: StoreChromePortalTarget;
  /** ARCH B2 soft-hosted store — pin layout authority. */
  featuredSoftHosted?: boolean;
  menuProductsForReviewRail?: StoreMenuReviewRailProduct[];
  onOpenReviews: (opts?: StoreReviewsPanelOpenOptions) => void;
}) {
  const storeLifecycle = useDeliverySurfaceLifecycle("store");
  const storeActive = storeLifecycle === "active";
  const featuredFocusActive = Boolean(focusProductId?.trim()) && focusEntryPreparing;
  const preparePinLayout = featuredFocusActive && featuredSoftHosted;
  const canInteract = canSell && !menuSelectBlocked;
  const menuBoardRef = useRef<StoreMenuBoardListHandle>(null);
  const tabsSentinelRef = useRef<HTMLDivElement>(null);
  const { pinned, tabsHeightPx } = useStoreDetailCategoryTabsPin({
    sentinelRef: tabsSentinelRef,
    tabsRef: menuStickyMeasureRef,
    enabled: storeActive || featuredFocusActive,
  });
  const firstSectionReadyRef = useRef(false);
  const firstVisibleRef = useRef(false);
  const firstInteractableRef = useRef(false);
  const focusHandledRef = useRef<string | null>(null);
  const focusPrepareCompleteRef = useRef<string | null>(null);
  const focusRingAppliedRef = useRef<string | null>(null);
  const menuSectionsRef = useRef(menuSectionsFiltered);
  menuSectionsRef.current = menuSectionsFiltered;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const tabsHeightPxRef = useRef(tabsHeightPx);
  tabsHeightPxRef.current = tabsHeightPx;
  const effectivePinned = pinned || preparePinLayout;
  const tabsPortaledToChromeHost =
    chromePortalTarget !== "inline" && chromePortalTarget !== "body" && effectivePinned;
  const [retainFocusScrollSpacer, setRetainFocusScrollSpacer] = useState(false);

  useEffect(() => {
    focusHandledRef.current = null;
    focusPrepareCompleteRef.current = null;
    focusRingAppliedRef.current = null;
  }, [focusProductId]);

  useEffect(() => {
    if (focusProductId) setRetainFocusScrollSpacer(true);
  }, [focusProductId]);

  useEffect(() => {
    if (storeActive) return;
    clearStoreMenuProductFocusRing(focusProductId);
  }, [storeActive, focusProductId]);

  /** Featured — offscreen pre-land (single scroll WRITE) before rtl slide. */
  useLayoutEffect(() => {
    const productId = focusProductId?.trim();
    if (!featuredFocusActive || !productId || menusLoading) return;
    if (focusPrepareCompleteRef.current === productId) return;
    if (storeLifecycle === "exiting") return;

    let cancelled = false;
    let rafId = 0;
    let stablePrev: ReturnType<typeof measureFeaturedEntryLandGeometry> = null;
    let stableCount = 0;
    let writePhase: "idle" | "written" = "idle";
    let headerScrollMeasurePrev: number | null = null;

    beginFeaturedEntryScrollPrepare();
    deliveryPresentationMarkEvent("featuredPortalDeferred", {
      productId,
      deferred: chromePortalTarget === "inline",
    });

    const tick = () => {
      if (cancelled) return;
      const sectionIndex = findMenuSectionIndexForProduct(menuSectionsRef.current, productId);
      if (sectionIndex < 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      onFocusEntryScrollSpyLock?.(sectionIndex);
      setActiveMenuSection(sectionIndex);

      const lastIdx = Math.max(0, menuSectionsRef.current.length - 1);
      menuBoardRef.current?.ensureSectionsHydratedThrough(lastIdx);
      if (!menuBoardRef.current?.isSectionHydrated(sectionIndex)) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const productEl = document.getElementById(storeMenuProductDomId(productId));
      if (!productEl || !(productEl.getBoundingClientRect().height > 0)) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      deliveryPresentationMarkEvent("focusTargetReady", { productId });

      const tabsEl = menuStickyMeasureRef.current;
      const measuredTabsH = tabsEl
        ? Math.round(tabsEl.getBoundingClientRect().height)
        : 0;
      const tabsH = Math.max(tabsHeightPxRef.current, measuredTabsH, 48);
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      const scrollRoot = getMainAppScrollRoot();
      const sectionEl = document.getElementById(storeMenuSectionDomId(sectionIndex));
      const headerEl = sectionEl?.querySelector("h3");
      const headerScrollMeasure =
        headerEl instanceof HTMLElement
          ? measureStoreDetailElementScrollTop(headerEl, scrollRoot)
          : null;

      const layoutProven = isFeaturedEntryFinalPinnedLayoutProvenForWrite({
        sectionIndex,
        tabsEl,
        tabsHeightPx: tabsH,
        viewportHeightPx: vh,
        headerScrollMeasurePx: headerScrollMeasure,
        headerScrollMeasurePrevPx: headerScrollMeasurePrev,
      });
      headerScrollMeasurePrev = headerScrollMeasure;

      if (!layoutProven) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      deliveryPresentationMarkEvent("featuredPinGeometryFinal", {
        productId,
        sectionIndex,
        tabsHeightPx: tabsH,
        tabsBottom: resolveFeaturedEntryFinalStickyBottomPx(tabsH),
        pinned: pinnedRef.current,
        preparePinLayout,
        effectivePinned: true,
        spacerApplied: true,
      });
      deliveryPresentationMarkEvent("featuredWriterUnlocked", {
        productId,
        sectionIndex,
        headerScrollMeasurePx: headerScrollMeasure,
      });

      if (writePhase === "idle") {
        const finalSticky = resolveFeaturedEntryFinalStickyBottomPx(tabsH);
        const wrote = writeFeaturedEntryScrollForCategoryHeader(sectionIndex, finalSticky, {
          productId,
          pinned: pinnedRef.current,
          effectivePinned: true,
          preparePinLayout,
        });
        if (wrote) {
          writePhase = "written";
          deliveryPresentationMarkEvent("focusLand", {
            productId,
            sectionIndex,
            phase: "pre-slide",
            pinned: pinnedRef.current,
          });
        }
      }

      if (writePhase !== "written") {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const geometry = measureFeaturedEntryLandGeometry({
        sectionIndex,
        productId,
        tabsEl,
        tabsHeightPx: tabsH,
        pinned: effectivePinned,
      });
      if (!geometry) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (stablePrev && isFeaturedEntryLandGeometryStable(stablePrev, geometry)) {
        stableCount += 1;
      } else {
        stableCount = 0;
        stablePrev = geometry;
      }

      if (
        stableCount >= 1 &&
        isFeaturedEntryLandGeometryVerified(geometry, productId, sectionIndex, vh)
      ) {
        deliveryPresentationMarkEvent("featuredPreLandVerified", {
          productId,
          sectionIndex,
          scrollTop: geometry.scrollTop,
          categoryDelta: geometry.categoryDelta,
          productDelta: geometry.productDelta,
        });
        deliveryPresentationMarkEvent("focusFinal", {
          productId,
          sectionIndex,
          deltaPx: geometry.categoryDelta,
          productDeltaPx: geometry.productDelta,
          phase: "pre-slide",
        });
        focusPrepareCompleteRef.current = productId;
        endFeaturedEntryScrollPrepare();
        dispatchFeaturedEntryReady({ productId, sectionIndex, geometry });
        onFeaturedEntryPositionReady?.();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      endFeaturedEntryScrollPrepare();
    };
  }, [
    featuredFocusActive,
    featuredSoftHosted,
    focusProductId,
    menusLoading,
    menuStickyMeasureRef,
    onFeaturedEntryPositionReady,
    onFocusEntryScrollSpyLock,
    storeLifecycle,
    chromePortalTarget,
    preparePinLayout,
  ]);

  /** Post-slide — focus ring + URL cleanup only. */
  useLayoutEffect(() => {
    if (!storeActive) return;
    const productId = focusProductId?.trim();
    if (!productId) return;
    if (focusPrepareCompleteRef.current !== productId) return;
    if (focusRingAppliedRef.current === productId) return;
    applyStoreMenuProductFocusRing(productId);
    focusRingAppliedRef.current = productId;
    focusHandledRef.current = productId;
    onFocusEntryReady?.();
    onFocusProductHandled?.();
  }, [storeActive, focusProductId, onFocusProductHandled, onFocusEntryReady]);

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
      {effectivePinned ? (
        <div
          data-store-focus-pin-spacer="1"
          className="w-full shrink-0"
          style={{ height: tabsHeightPx }}
          aria-hidden
        />
      ) : null}
      {tabsPortaledToChromeHost ? (
        <div
          className="w-full shrink-0"
          style={{ height: tabsHeightPx }}
          aria-hidden
          data-store-category-tabs-layout-placeholder="1"
        />
      ) : null}
      <CategoryStickyTabs
        measureRef={menuStickyMeasureRef}
        sections={menuSectionsFiltered.map((s) => ({ label: s.heading }))}
        activeIndex={activeMenuSection}
        menuSearchOpen={menuSearchOpen}
        menuQuery={menuQuery}
        setMenuQuery={setMenuQuery}
        setMenuSearchOpen={setMenuSearchOpen}
        stickyTopCss={stickyTop}
        pinned={effectivePinned}
        chromePortalTarget={chromePortalTarget}
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
