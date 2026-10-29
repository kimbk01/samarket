"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { forwardRef, useImperativeHandle, useMemo } from "react";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { CategoryMenuSection } from "@/components/stores/detail/CategoryMenuSection";
import { DeferredMenuSectionPlaceholder } from "@/components/stores/detail/DeferredMenuSectionPlaceholder";
import { useDeferredMenuSectionHydration } from "@/components/stores/detail/use-deferred-menu-section-hydration";
import { countMenuBoardItems } from "@/lib/dibay/store-menu-viewport-policy";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { resolveStoreMenuBoardEmptyKind } from "@/lib/stores/store-menu-board-empty-kind";

export type StoreMenuBoardListHandle = {
  ensureSectionsHydratedThrough: (sectionIndex: number) => void;
  isSectionHydrated: (sectionIndex: number) => boolean;
};

export const StoreMenuBoardList = forwardRef<
  StoreMenuBoardListHandle,
  {
    storeSlug: string;
    sections: MenuSection[];
    /** 메뉴 공개(S-01: 판매 승인 OR 샘플) */
    canSell: boolean;
    /** C-04 — 메뉴 검색어 입력 중일 때만 빈 결과를 「검색 결과 없음」으로 */
    menuQueryActive?: boolean;
    /** C-04 — 메뉴 로드 실패 → 오류 + 재시도 */
    loadFailed?: boolean;
    onRetry?: () => void;
    menuSelectBlocked?: boolean;
    menuSelectHint?: string;
    addActionsBlocked?: boolean;
    sectionDomId?: (sectionIndex: number) => string;
    sectionScrollMarginClass?: string;
    sectionScrollMarginTopPx?: number;
    sectionScrollMarginCss?: string;
    onOpenProduct?: (productId: string) => void;
    onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
    onFirstCategoryProductPaint?: () => void;
    /** focusProduct PREPARING — target section 까지 sync hydrate */
    forceHydrateThroughIndex?: number | null;
  }
>(function StoreMenuBoardList(
  {
    storeSlug,
    sections,
    canSell,
    menuQueryActive = false,
    loadFailed = false,
    onRetry,
    menuSelectBlocked,
    menuSelectHint,
    addActionsBlocked,
    sectionDomId,
    sectionScrollMarginClass,
    sectionScrollMarginTopPx,
    sectionScrollMarginCss,
    onOpenProduct,
    onQuickAddProduct,
    onFirstCategoryProductPaint,
    forceHydrateThroughIndex = null,
  },
  ref
) {
  const { t } = useI18n();
  const boardFlatCount = useMemo(() => countMenuBoardItems(sections), [sections]);
  const { deferEnabled, sentinelRef, ensureHydratedThrough, isSectionHydrated } =
    useDeferredMenuSectionHydration(sections, forceHydrateThroughIndex ?? null);

  useImperativeHandle(
    ref,
    () => ({
      ensureSectionsHydratedThrough: (sectionIndex: number) => {
        ensureHydratedThrough(sectionIndex, "tab_or_scroll");
      },
      isSectionHydrated: (sectionIndex: number) => isSectionHydrated(sectionIndex),
    }),
    [ensureHydratedThrough, isSectionHydrated]
  );

  if (loadFailed) {
    return (
      <div className="mt-4 px-4" data-store-menu-state="load_failed">
        <MyStateView
          kind="error"
          error={{
            message: t("store_menu_load_failed"),
            onRetry: () => onRetry?.(),
          }}
        />
      </div>
    );
  }

  if (!canSell) {
    return (
      <div className="mt-4 px-4" data-store-menu-state="menu_closed">
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-8 text-center text-[14px] leading-relaxed text-sam-muted shadow-sm">
          {t("store_menu_sales_paused")}
        </p>
      </div>
    );
  }

  if (boardFlatCount === 0) {
    const emptyKind = resolveStoreMenuBoardEmptyKind({ menuQueryActive });
    return (
      <div className="mt-4 px-4" data-store-menu-state={emptyKind}>
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-8 text-center text-[14px] leading-relaxed text-sam-muted shadow-sm">
          {emptyKind === "search_no_results"
            ? t("store_menu_search_no_results")
            : t("store_menu_no_items_registered")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0 bg-[var(--delivery-bg-card)] px-4 pb-4">
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
            addActionsBlocked={addActionsBlocked}
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
