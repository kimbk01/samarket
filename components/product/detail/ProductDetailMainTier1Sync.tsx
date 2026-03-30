"use client";

import { useLayoutEffect } from "react";
import type { Product } from "@/lib/types/product";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { ProductDetailHeaderToolbar } from "./ProductDetailHeaderToolbar";

export function ProductDetailMainTier1Sync({
  product,
  onReport,
  hideFavorite,
}: {
  product: Product;
  onReport?: () => void;
  hideFavorite?: boolean;
}) {
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    const titleText = product.title?.trim() || "상품";
    setMainTier1Extras({
      tier1: {
        titleText,
        showHubQuickActions: false,
        rightSlot: (
          <ProductDetailHeaderToolbar
            productId={product.id}
            onReport={onReport}
            hideFavorite={hideFavorite}
          />
        ),
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, product.id, product.title, onReport, hideFavorite]);

  return null;
}
