"use client";

import type { ReactNode, RefObject } from "react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { scrollStoreMenuProductIntoView } from "@/lib/dibay/store-menu-product-focus";
import { findMenuSectionIndexForProduct } from "@/lib/stores/group-store-products-by-menu";
import { deliveryMenuVisibleMarkFirstSectionReady } from "@/lib/dibay/delivery-menu-visible-trace";
import type { StoreMenuBoardListHandle } from "@/components/stores/detail/StoreMenuBoardList";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { CategoryStickyTabs } from "@/components/stores/detail/CategoryStickyTabs";
import { PopularMenuSection } from "@/components/stores/detail/PopularMenuSection";
import { RecommendedMenuSection } from "@/components/stores/detail/RecommendedMenuSection";
import { StoreMenuBoardList } from "@/components/stores/detail/StoreMenuBoardList";
import type { MenuSection, StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { StoreDetailMenusSkeleton } from "@/components/stores/store-detail/StoreDetailMenusSkeleton";
import { useMenuSubtreeCartStabilityGuard } from "@/components/stores/detail/use-menu-subtree-cart-stability-guard";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import {
  DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY,
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

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
}) {
  const canInteract = canSell && !menuSelectBlocked;
  const menuBoardRef = useRef<StoreMenuBoardListHandle>(null);
  const firstSectionReadyRef = useRef(false);
  const firstVisibleRef = useRef(false);
  const focusHandledRef = useRef<string | null>(null);

  useEffect(() => {
    focusHandledRef.current = null;
  }, [focusProductId]);

  useEffect(() => {
    const productId = focusProductId?.trim();
    if (!productId || menusLoading) return;
    if (focusHandledRef.current === productId) return;

    const sectionIndex = findMenuSectionIndexForProduct(menuSectionsFiltered, productId);
    if (sectionIndex < 0) {
      focusHandledRef.current = productId;
      onFocusProductHandled?.();
      return;
    }

    const stickyBottom = () =>
      menuStickyMeasureRef.current?.getBoundingClientRect().bottom ?? 120;

    const focusCategorySection = () => {
      menuBoardRef.current?.ensureSectionsHydratedThrough(sectionIndex);
      setActiveMenuSection(sectionIndex);
      scrollStoreSectionIntoView(sectionIndex);
    };

    const finishFocus = () => {
      focusHandledRef.current = productId;
      onFocusProductHandled?.();
    };

    const tryComplete = (): boolean => {
      focusCategorySection();
      const highlighted = scrollStoreMenuProductIntoView(productId, stickyBottom());
      if (highlighted) {
        finishFocus();
        return true;
      }
      return false;
    };

    focusCategorySection();

    const delays = [80, 240, 480, 720];
    const timers = delays.map((ms) =>
      window.setTimeout(() => {
        if (focusHandledRef.current === productId) return;
        if (tryComplete()) return;
        if (ms === delays[delays.length - 1]!) finishFocus();
      }, ms)
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [
    focusProductId,
    menusLoading,
    menuSectionsFiltered,
    menuStickyMeasureRef,
    scrollStoreSectionIntoView,
    setActiveMenuSection,
    onFocusProductHandled,
  ]);

  useMenuSubtreeCartStabilityGuard(commerceCartStoreId);

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

  const stickyTop = "calc(env(safe-area-inset-top, 0px) + 56px)";

  return (
    <div id="store-menu-panel">
      {!menusLoading ? (
        <>
          <RecommendedMenuSection
            cards={recommendedForUi}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProductSheet}
          />
          <PopularMenuSection
            cards={popularMenuCards}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProductSheet}
          />
        </>
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
        onSelect={(i) => {
          menuBoardRef.current?.ensureSectionsHydratedThrough(i);
          setActiveMenuSection(i);
          scrollStoreSectionIntoView(i);
        }}
      />

      {menuTopSlot ? (
        <div className="border-b border-neutral-100 bg-white px-4 pb-2 pt-1">{menuTopSlot}</div>
      ) : null}

      {menusLoading ? (
        <StoreDetailMenusSkeleton />
      ) : (
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
        />
      )}
    </div>
  );
});
