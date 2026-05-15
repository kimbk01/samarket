"use client";

import type { ReactNode, RefObject } from "react";
import { StoreMenuBoardPreamble } from "@/components/stores/StoreMenuBoardPreamble";
import { StoreMenuCategoryChips } from "@/components/stores/StoreMenuCategoryChips";
import { StorePublicMenuList } from "@/components/stores/StorePublicMenuList";
import type {
  MenuSection,
  StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
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
  /** 스티키 카테고리 바로 아래 — `menu_top` 공지 등 */
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

  return (
    <div id="store-menu-panel">
      {!menusLoading ? (
        <StoreMenuBoardPreamble
          recommendedCards={recommendedMenuCards}
          popularCards={popularMenuCards}
          canInteract={canInteract}
          menuSelectBlocked={menuSelectBlocked}
          onOpenProduct={onOpenProductSheet}
        />
      ) : null}

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

      {menuTopSlot ? (
        <div className="border-b border-neutral-100 bg-white px-4 pb-2 pt-1">{menuTopSlot}</div>
      ) : null}

      {menusLoading ? (
        <StoreDetailMenusSkeleton />
      ) : (
        <StorePublicMenuList
          storeSlug={storeSlug}
          sections={menuSectionsFiltered}
          canSell={canSell}
          sectionDomId={(i) => `store-sec-${i}`}
          sectionScrollMarginCss={sectionScrollMarginCss}
          menuSelectBlocked={menuSelectBlocked}
          menuSelectHint={menuSelectHint}
          onOpenProduct={onOpenProductSheet}
          onQuickAddProduct={onQuickAddProduct}
        />
      )}
    </div>
  );
}
