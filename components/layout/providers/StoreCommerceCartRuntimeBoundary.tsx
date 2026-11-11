"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { shouldMountStoreCommerceCartProvider } from "@/lib/layout/store-commerce-cart-mount-surfaces";
import { STORES_HOME_IDLE_DEFER_MS } from "@/lib/stores/stores-home-perf-marks";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import { useStoreCartPreviewUIStore } from "@/lib/stores/store-cart-preview-ui-store";
import { useStoreCartConflictUIStore } from "@/lib/stores/store-cart-conflict-ui-store";
import {
  closeStoreCommerceRouteScopedOverlays,
  shouldCloseStoreCommerceOverlaysOnPathChange,
} from "@/lib/stores/close-store-commerce-route-overlays";

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
 * DO NOT: `/stores/owner` 에서 Customer cart 를 켬 — Provider 는 그대로 두고 `inert`(값 null·저장소/동기화 0)로 끈다.
 *   예전처럼 Fragment 로 바꾸면 앱 셸 전체가 다시 만들어져 하단 탭 보관 화면이 사라졌다(D1 R1, 2026-11-12 운영 확인).
 */
export function StoreCommerceCartRuntimeBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const mountCart = shouldMountStoreCommerceCartProvider(pathname);
  const productId = useStoreProductSheetUIStore((s) => s.productId);
  const previewOpen = useStoreCartPreviewUIStore((s) => s.open);
  const conflictOpen = useStoreCartConflictUIStore((s) => s.open);
  const [idlePortalsReady, setIdlePortalsReady] = useState(false);
  const prevPathnameRef = useRef<string | null>(null);

  /** S2-03 — 화면 이동 시 옵션 시트·미리보기·담기 확인을 닫는다 (이전 화면 시트 잔존·재등장 방지) */
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (shouldCloseStoreCommerceOverlaysOnPathChange(prev, pathname)) {
      closeStoreCommerceRouteScopedOverlays();
    }
  }, [pathname]);

  useEffect(() => {
    if (!mountCart) return;
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setIdlePortalsReady(true), { timeout: STORES_HOME_IDLE_DEFER_MS });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setIdlePortalsReady(true), 0);
    return () => window.clearTimeout(t);
  }, [mountCart]);

  const ownerAdmin = isStoreOwnerAdminPath(pathname);
  const mountPortals =
    !ownerAdmin && mountCart && (idlePortalsReady || !!productId || previewOpen || conflictOpen);

  return (
    <StoreCommerceCartProvider inert={ownerAdmin}>
      {children}
      {mountPortals ? <StoreCommerceCartPortalsLazy /> : null}
    </StoreCommerceCartProvider>
  );
}
