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

/**
 * 장바구니 컨텍스트 — sheet portal 은 idle·첫 상호작용 후 별도 청크.
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

  if (!mountCart) {
    return <>{children}</>;
  }

  const mountPortals = idlePortalsReady || !!productId || previewOpen || conflictOpen;

  return (
    <StoreCommerceCartProvider>
      {children}
      {mountPortals ? <StoreCommerceCartPortalsLazy /> : null}
    </StoreCommerceCartProvider>
  );
}
