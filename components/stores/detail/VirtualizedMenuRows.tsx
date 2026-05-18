"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductMenuCard } from "@/components/stores/detail/ProductMenuCard";

import {
  MENU_ROW_ESTIMATE_PX,
  shouldVirtualizeMenuSection as shouldVirtualizeMenuSectionPolicy,
} from "@/lib/dibay/store-menu-viewport-policy";

export function shouldVirtualizeMenuSection(
  itemCount: number,
  boardFlatCount: number
): boolean {
  return shouldVirtualizeMenuSectionPolicy(itemCount, boardFlatCount);
}

export function VirtualizedMenuRows({
  items,
  storeSlug,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
  onQuickAddProduct,
  onFirstRowPaint,
}: {
  items: StoreDetailProductCard[];
  storeSlug: string;
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
  onFirstRowPaint?: () => void;
}) {
  const rowVirtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => MENU_ROW_ESTIMATE_PX,
    overscan: 6,
  });

  useLayoutEffect(() => {
    if (!onFirstRowPaint || items.length === 0) return;
    onFirstRowPaint();
  }, [items.length, onFirstRowPaint]);

  return (
    <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const p = items[vi.index]!;
        return (
          <div
            key={p.id}
            className="absolute left-0 top-0 w-full px-0"
            data-index={vi.index}
            ref={rowVirtualizer.measureElement}
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            <ProductMenuCard
              storeSlug={storeSlug}
              p={p}
              canInteract={canInteract}
              menuSelectBlocked={menuSelectBlocked}
              onOpenProduct={onOpenProduct}
              onQuickAddProduct={onQuickAddProduct}
            />
          </div>
        );
      })}
    </div>
  );
}
