"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useLayoutEffect } from "react";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductMenuCard } from "@/components/stores/detail/ProductMenuCard";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { shouldVirtualizeMenuSection, VirtualizedMenuRows } from "@/components/stores/detail/VirtualizedMenuRows";

const MENU_CARD_GAP_PX = 8;

export function CategoryMenuSection({
  section,
  sectionIndex,
  sectionDomId,
  sectionScrollMarginClass,
  sectionScrollMarginCss,
  sectionScrollMarginTopPx,
  storeSlug,
  canSell,
  boardFlatCount = 0,
  menuSelectBlocked,
  menuSelectHint,
  onOpenProduct,
  onQuickAddProduct,
  onFirstProductPaint,
}: {
  section: MenuSection;
  sectionIndex: number;
  sectionDomId?: (sectionIndex: number) => string;
  sectionScrollMarginClass?: string;
  sectionScrollMarginCss?: string;
  sectionScrollMarginTopPx?: number;
  storeSlug: string;
  canSell: boolean;
  boardFlatCount?: number;
  menuSelectBlocked?: boolean;
  menuSelectHint?: string;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
  onFirstProductPaint?: () => void;
}) {
  const { t } = useI18n();
  const canInteract = canSell && !menuSelectBlocked;

  useLayoutEffect(() => {
    if (!onFirstProductPaint || section.items.length === 0) return;
    onFirstProductPaint();
  }, [onFirstProductPaint, section.items.length]);

  return (
    <section
      key={`${section.heading}-${sectionIndex}`}
      id={sectionDomId ? sectionDomId(sectionIndex) : undefined}
      className={
        sectionDomId && !sectionScrollMarginCss && sectionScrollMarginTopPx == null
          ? sectionScrollMarginClass
          : undefined
      }
      style={
        sectionDomId && sectionScrollMarginCss
          ? { scrollMarginTop: sectionScrollMarginCss }
          : sectionDomId && sectionScrollMarginTopPx != null
            ? { scrollMarginTop: sectionScrollMarginTopPx }
            : undefined
      }
    >
      <div
        className={`border-t border-[var(--delivery-border-section)] bg-[var(--delivery-bg)] ${
          sectionIndex === 0 ? "pt-3.5" : "pt-4.5"
        }`}
      >
        <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-[var(--delivery-dark)]">
          {section.listHeading ?? section.heading}
        </h3>
      </div>
      {menuSelectBlocked && sectionIndex === 0 ? (
        <p className="mt-2 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-amber-950">
          {menuSelectHint?.trim() || t("store_menu_select_blocked_default")}
        </p>
      ) : null}
      <div className="mt-2" style={{ background: DibayMenuBoard.pageBg, paddingBottom: 4 }}>
        {shouldVirtualizeMenuSection(section.items.length, boardFlatCount) ? (
          <VirtualizedMenuRows
            items={section.items}
            storeSlug={storeSlug}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProduct}
            onQuickAddProduct={onQuickAddProduct}
            onFirstRowPaint={onFirstProductPaint}
          />
        ) : (
          <ul className="flex flex-col" style={{ gap: MENU_CARD_GAP_PX }}>
            {section.items.map((p) => (
              <li key={p.id} className="overflow-hidden" style={{ borderRadius: DibayMenuBoard.cardRadiusPx }}>
                <ProductMenuCard
                  storeSlug={storeSlug}
                  p={p}
                  canInteract={canInteract}
                  menuSelectBlocked={menuSelectBlocked}
                  onOpenProduct={onOpenProduct}
                  onQuickAddProduct={onQuickAddProduct}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
