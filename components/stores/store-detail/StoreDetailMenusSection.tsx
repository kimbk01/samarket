"use client";

import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";
import { CategoryStickyTabs } from "@/components/stores/detail/CategoryStickyTabs";
import { PopularMenuSection } from "@/components/stores/detail/PopularMenuSection";
import { RecommendedMenuSection } from "@/components/stores/detail/RecommendedMenuSection";
import { StoreMenuBoardList } from "@/components/stores/detail/StoreMenuBoardList";
import type { MenuSection, StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { StoreDetailMenusSkeleton } from "@/components/stores/store-detail/StoreDetailMenusSkeleton";

export function StoreDetailMenusSection({
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
  menuTopSlot,
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
  menuTopSlot?: ReactNode;
}) {
  const canInteract = canSell && !menuSelectBlocked;

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
          storeSlug={storeSlug}
          sections={menuSectionsFiltered}
          canSell={canSell}
          menuSelectBlocked={menuSelectBlocked}
          menuSelectHint={menuSelectHint}
          sectionDomId={(i) => `store-sec-${i}`}
          sectionScrollMarginCss={sectionScrollMarginCss}
          onOpenProduct={onOpenProductSheet}
          onQuickAddProduct={onQuickAddProduct}
        />
      )}
    </div>
  );
}
