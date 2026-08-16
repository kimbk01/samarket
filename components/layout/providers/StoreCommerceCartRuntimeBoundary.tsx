"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { shouldMountStoreCommerceCartProvider } from "@/lib/layout/store-commerce-cart-mount-surfaces";
import { STORES_HOME_IDLE_DEFER_MS } from "@/lib/stores/stores-home-perf-marks";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import { useStoreCartPreviewUIStore } from "@/lib/stores/store-cart-preview-ui-store";
import { useStoreCartConflictUIStore } from "@/lib/stores/store-cart-conflict-ui-store";

const StoreCommerceCartPortalsLazy = dynamic(
  () =>
    import("@/components/layout/providers/StoreCommerceCartPortals").then(
      (m) => m.StoreCommerceCartPortals
    ),
  { ssr: false }
);

function isStoreOwnerAdminPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.trim() ?? "";
  return p === "/stores/owner" || p.startsWith("/stores/owner/");
}

/**
 * 장바구니 컨텍스트 — sheet portal 은 idle·첫 상호작용 후 별도 청크.
 *
 * CONTRACT — 하단 메인 허브 간 Provider 트리 고정 (AppRouteTransition remount 금지).
 * DO NOT: mountCart false 일 때 Fragment 로 바꿔 셸을 remount.
 * DO NOT: `/stores/owner` 에서 Customer cart Provider 마운트.
 */
export function StoreCommerceCartRuntimeBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const mountCart = shouldMountStoreCommerceCartProvider(pathname);
  const productId = useStoreProductSheetUIStore((s) => s.productId);
  const previewOpen = useStoreCartPreviewUIStore((s) => s.open);
  const conflictOpen = useStoreCartConflictUIStore((s) => s.open);
  const [idlePortalsReady, setIdlePortalsReady] = useState(false);

  useEffect(() => {
    if (!mountCart) return;
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setIdlePortalsReady(true), { timeout: STORES_HOME_IDLE_DEFER_MS });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setIdlePortalsReady(true), 0);
    return () => window.clearTimeout(t);
  }, [mountCart]);

  if (isStoreOwnerAdminPath(pathname)) {
    return <>{children}</>;
  }

  const mountPortals = mountCart && (idlePortalsReady || !!productId || previewOpen || conflictOpen);

  return (
    <StoreCommerceCartProvider>
      {children}
      {mountPortals ? <StoreCommerceCartPortalsLazy /> : null}
    </StoreCommerceCartProvider>
  );
}
