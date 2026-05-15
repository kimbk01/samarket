"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductMenuCard } from "@/components/stores/detail/ProductMenuCard";

const ESTIMATE_ROW = 130;
const VIRT_THRESHOLD = 80;

export function shouldVirtualizeMenuSection(itemCount: number): boolean {
  return itemCount >= VIRT_THRESHOLD;
}

export function VirtualizedMenuRows({
  items,
  storeSlug,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: {
  items: StoreDetailProductCard[];
  storeSlug: string;
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const rowVirtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATE_ROW,
    overscan: 6,
  });

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
