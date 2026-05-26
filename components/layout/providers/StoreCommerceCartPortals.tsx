"use client";

import { StoreCartConflictPortal } from "@/components/stores/cart/StoreCartConflictPortal";
import { StoreCartPreviewPortal } from "@/components/stores/detail/StoreCartPreviewPortal";
import { StoreDetailToastPortal } from "@/components/stores/detail/StoreDetailToastPortal";
import { StoreProductSheetPortal } from "@/components/stores/product-sheet/StoreProductSheetPortal";

/** 장바구니 sheet·충돌 portal 묶음 — `StoreCommerceCartRuntimeBoundary` 가 idle/필요 시에만 로드 */
export function StoreCommerceCartPortals() {
  return (
    <>
      <StoreProductSheetPortal />
      <StoreDetailToastPortal />
      <StoreCartConflictPortal />
      <StoreCartPreviewPortal />
    </>
  );
}
