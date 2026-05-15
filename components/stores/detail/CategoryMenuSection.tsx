"use client";

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
  menuSelectBlocked,
  menuSelectHint,
  onOpenProduct,
  onQuickAddProduct,
}: {
  section: MenuSection;
  sectionIndex: number;
  sectionDomId?: (sectionIndex: number) => string;
  sectionScrollMarginClass?: string;
  sectionScrollMarginCss?: string;
  sectionScrollMarginTopPx?: number;
  storeSlug: string;
  canSell: boolean;
  menuSelectBlocked?: boolean;
  menuSelectHint?: string;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const canInteract = canSell && !menuSelectBlocked;

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
      <div className={sectionIndex === 0 ? "pt-3.5" : "pt-4.5"}>
        <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-neutral-900">
          {section.listHeading ?? section.heading}
        </h3>
      </div>
      {menuSelectBlocked && sectionIndex === 0 ? (
        <p className="mt-2 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-amber-950">
          {menuSelectHint?.trim() || "지금은 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."}
        </p>
      ) : null}
      <div className="mt-2" style={{ background: DibayMenuBoard.pageBg, paddingBottom: 4 }}>
        {shouldVirtualizeMenuSection(section.items.length) ? (
          <VirtualizedMenuRows
            items={section.items}
            storeSlug={storeSlug}
            canInteract={canInteract}
            menuSelectBlocked={menuSelectBlocked}
            onOpenProduct={onOpenProduct}
            onQuickAddProduct={onQuickAddProduct}
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
