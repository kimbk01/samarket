"use client";

import { useEffect, type DependencyList } from "react";
import {
  getStoreDetailAppScrollRootCached,
  invalidateStoreDetailScrollRootCache,
  isDocumentScrollRoot,
} from "@/lib/ui/store-detail-scroll-root";
import { invalidateStoreDetailViewportMetricsCache } from "@/lib/ui/store-detail-viewport-metrics";

/**
 * 매장 상세 — 실제 스크롤 루트(`<main>` | document) 1곳만 구독, rAF 배치.
 * `window` 단독 구독 금지(문서 스크롤 vs main 스크롤 불일치).
 */
export function useStoreDetailScrollRootScroll(
  onScroll: () => void,
  deps: DependencyList,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    invalidateStoreDetailScrollRootCache();
    const scrollRoot = getStoreDetailAppScrollRootCached();
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      onScroll();
    };

    const onScrollEvent = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(flush);
    };

    if (isDocumentScrollRoot(scrollRoot)) {
      window.addEventListener("scroll", onScrollEvent, { passive: true });
    } else {
      scrollRoot.addEventListener("scroll", onScrollEvent, { passive: true });
    }

    let vvResizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onVvResize = () => {
      invalidateStoreDetailScrollRootCache();
      invalidateStoreDetailViewportMetricsCache();
      if (vvResizeTimer) clearTimeout(vvResizeTimer);
      vvResizeTimer = setTimeout(onScrollEvent, 120);
    };
    window.visualViewport?.addEventListener("resize", onVvResize);

    onScrollEvent();

    return () => {
      if (isDocumentScrollRoot(scrollRoot)) {
        window.removeEventListener("scroll", onScrollEvent);
      } else {
        scrollRoot.removeEventListener("scroll", onScrollEvent);
      }
      window.visualViewport?.removeEventListener("resize", onVvResize);
      if (vvResizeTimer) clearTimeout(vvResizeTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies semantic deps
  }, [enabled, onScroll, ...deps]);
}
