"use client";

import { forwardRef, useImperativeHandle, useMemo } from "react";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { CategoryMenuSection } from "@/components/stores/detail/CategoryMenuSection";
import { DeferredMenuSectionPlaceholder } from "@/components/stores/detail/DeferredMenuSectionPlaceholder";
import { useDeferredMenuSectionHydration } from "@/components/stores/detail/use-deferred-menu-section-hydration";
import { countMenuBoardItems } from "@/lib/dibay/store-menu-viewport-policy";

export type StoreMenuBoardListHandle = {
  ensureSectionsHydratedThrough: (sectionIndex: number) => void;
};

export const StoreMenuBoardList = forwardRef<
  StoreMenuBoardListHandle,
  {
    storeSlug: string;
    sections: MenuSection[];
    canSell: boolean;
    menuSelectBlocked?: boolean;
    menuSelectHint?: string;
    sectionDomId?: (sectionIndex: number) => string;
    sectionScrollMarginClass?: string;
    sectionScrollMarginTopPx?: number;
    sectionScrollMarginCss?: string;
    onOpenProduct?: (productId: string) => void;
    onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
    onFirstCategoryProductPaint?: () => void;
  }
>(function StoreMenuBoardList(
  {
    storeSlug,
    sections,
    canSell,
    menuSelectBlocked,
    menuSelectHint,
    sectionDomId,
    sectionScrollMarginClass,
    sectionScrollMarginTopPx,
    sectionScrollMarginCss,
    onOpenProduct,
    onQuickAddProduct,
    onFirstCategoryProductPaint,
  },
  ref
) {
  const boardFlatCount = useMemo(() => countMenuBoardItems(sections), [sections]);
  const { deferEnabled, sentinelRef, ensureHydratedThrough, isSectionHydrated } =
    useDeferredMenuSectionHydration(sections);

  useImperativeHandle(
    ref,
    () => ({
      ensureSectionsHydratedThrough: (sectionIndex: number) => {
        ensureHydratedThrough(sectionIndex, "tab_or_scroll");
      },
    }),
    [ensureHydratedThrough]
  );

  if (!canSell) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.
        </p>
      </div>
    );
  }

  if (boardFlatCount === 0) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          {sections.length === 0 ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-4 pb-4" style={{ background: DibayMenuBoard.pageBg }}>
      {sections.map((section, sectionIndex) => {
        if (!isSectionHydrated(sectionIndex)) {
          return (
            <DeferredMenuSectionPlaceholder
              key={`defer-${section.heading}-${sectionIndex}`}
              section={section}
              sectionIndex={sectionIndex}
              sectionDomId={sectionDomId}
              sectionScrollMarginCss={sectionScrollMarginCss}
            />
          );
        }
        return (
          <CategoryMenuSection
            key={`${section.heading}-${sectionIndex}`}
            section={section}
            sectionIndex={sectionIndex}
            sectionDomId={sectionDomId}
            sectionScrollMarginClass={sectionScrollMarginClass}
            sectionScrollMarginCss={sectionScrollMarginCss}
            sectionScrollMarginTopPx={sectionScrollMarginTopPx}
            storeSlug={storeSlug}
            canSell={canSell}
            menuSelectBlocked={menuSelectBlocked}
            menuSelectHint={sectionIndex === 0 ? menuSelectHint : undefined}
            boardFlatCount={boardFlatCount}
            onOpenProduct={onOpenProduct}
            onQuickAddProduct={onQuickAddProduct}
            onFirstProductPaint={sectionIndex === 0 ? onFirstCategoryProductPaint : undefined}
          />
        );
      })}
      {deferEnabled ? <div ref={sentinelRef} className="h-px w-full" aria-hidden /> : null}
    </div>
  );
});
