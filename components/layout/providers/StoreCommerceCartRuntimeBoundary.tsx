"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { StoreCartConflictPortal } from "@/components/stores/cart/StoreCartConflictPortal";
import { StoreCartPreviewPortal } from "@/components/stores/detail/StoreCartPreviewPortal";
import { StoreDetailToastPortal } from "@/components/stores/detail/StoreDetailToastPortal";
import { StoreProductSheetPortal } from "@/components/stores/product-sheet/StoreProductSheetPortal";
import { shouldMountStoreCommerceCartProvider } from "@/lib/layout/store-commerce-cart-mount-surfaces";

/**
 * 장바구니 컨텍스트 — `shouldMountStoreCommerceCartProvider` 표면만 마운트.
 * 모듈을 `MainAppProviderTree` 와 분리해 (main) 공통 그래프의 정적 import 무게를 줄인다.
 */
export function StoreCommerceCartRuntimeBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const mountCart = shouldMountStoreCommerceCartProvider(pathname);
  if (!mountCart) {
    return <>{children}</>;
  }
  return (
    <StoreCommerceCartProvider>
      {children}
      <StoreProductSheetPortal />
      <StoreDetailToastPortal />
      <StoreCartConflictPortal />
      <StoreCartPreviewPortal />
    </StoreCommerceCartProvider>
  );
}
