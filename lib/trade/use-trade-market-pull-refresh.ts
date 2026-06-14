"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  getMainAppScrollRootCached,
  getMainAppScrollTop,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  computeTradeMarketPullPxFromTouchDy,
  getTradeMarketPullRefreshSnapshot,
  patchTradeMarketPullRefresh,
  runTradeMarketPullRefresh,
  TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX,
} from "@/lib/trade/trade-market-pull-refresh-store";

const PULL_ENGAGE_PX = 10;

function isScrollAtTop(): boolean {
  return getMainAppScrollTop(getMainAppScrollRootCached()) <= 0;
}

function isPullRefreshExcludedTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest("input, textarea, select");
}

function isVerticalPullDown(dy: number, dx: number): boolean {
  return dy > PULL_ENGAGE_PX && dy >= Math.abs(dx) * 0.8;
}

/**
 * CONTRACT — `/market`·`/market/[slug]` PTR: scrollTop=0 이면 세로 당김 → 1단·2단(탭) 사이 힌트 슬롯 확장.
 */
export function useTradeMarketPullRefresh(enabled: boolean): void {
  const pathname = usePathname();
  const pullRef = useRef(0);
  const trackingRef = useRef(false);
  const pullingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    invalidateMainAppScrollRootCache();

    const resetPull = () => {
      pullingRef.current = false;
      trackingRef.current = false;
      if (pullRef.current === 0 && getTradeMarketPullRefreshSnapshot().pullPx === 0) return;
      pullRef.current = 0;
      patchTradeMarketPullRefresh({ pullPx: 0 });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (getTradeMarketPullRefreshSnapshot().refreshing) return;
      if (!isScrollAtTop()) return;
      if (isPullRefreshExcludedTarget(e.target)) return;

      trackingRef.current = true;
      pullingRef.current = false;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      startXRef.current = e.touches[0]?.clientX ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      if (!isScrollAtTop()) {
        resetPull();
        return;
      }

      const y = e.touches[0]?.clientY;
      const x = e.touches[0]?.clientX;
      if (y == null || x == null) return;

      const dy = y - startYRef.current;
      const dx = x - startXRef.current;

      if (dy <= 0) {
        if (pullingRef.current) {
          try {
            e.preventDefault();
          } catch {
            /* noop */
          }
        }
        resetPull();
        return;
      }

      if (!pullingRef.current && !isVerticalPullDown(dy, dx)) return;

      pullingRef.current = true;
      try {
        e.preventDefault();
      } catch {
        /* noop */
      }

      const next = computeTradeMarketPullPxFromTouchDy(dy);
      pullRef.current = next;
      if (next > TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX * 0.25) suppressClickRef.current = true;
      patchTradeMarketPullRefresh({ pullPx: next });
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      if (e.target instanceof Element && e.target.closest("a[href], button, [role='tab']")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onTouchEnd = () => {
      if (!trackingRef.current && !pullingRef.current) return;

      const pulled = pullRef.current;
      trackingRef.current = false;
      pullingRef.current = false;

      if (pulled >= TRADE_MARKET_PULL_REFRESH_THRESHOLD_PX) {
        pullRef.current = 0;
        void runTradeMarketPullRefresh(pulled, pathname);
        return;
      }
      resetPull();
    };

    const bindRoot = (): (() => void) | null => {
      const root = getMainAppScrollRootCached();
      if (!(root instanceof HTMLElement)) return null;

      const optsCapture = { capture: true } as const;
      root.addEventListener("touchstart", onTouchStart, { passive: true, ...optsCapture });
      root.addEventListener("touchmove", onTouchMove, { passive: false, ...optsCapture });
      root.addEventListener("touchend", onTouchEnd, optsCapture);
      root.addEventListener("touchcancel", onTouchEnd, optsCapture);
      root.addEventListener("click", onClickCapture, { capture: true });

      return () => {
        root.removeEventListener("touchstart", onTouchStart, optsCapture);
        root.removeEventListener("touchmove", onTouchMove, optsCapture);
        root.removeEventListener("touchend", onTouchEnd, optsCapture);
        root.removeEventListener("touchcancel", onTouchEnd, optsCapture);
        root.removeEventListener("click", onClickCapture, optsCapture);
      };
    };

    let unbind = bindRoot();
    const root = getMainAppScrollRootCached();
    if (root instanceof HTMLElement) {
      root.dataset.tradeMarketPtrRoot = "1";
    }
    const retryId = window.setTimeout(() => {
      unbind?.();
      unbind = bindRoot();
      const retryRoot = getMainAppScrollRootCached();
      if (retryRoot instanceof HTMLElement) {
        retryRoot.dataset.tradeMarketPtrRoot = "1";
      }
    }, 0);

    const unsubScroll = subscribeAppShellScroll(() => {
      if (!isScrollAtTop()) resetPull();
    });

    return () => {
      window.clearTimeout(retryId);
      unsubScroll();
      unbind?.();
      const cleanupRoot = getMainAppScrollRootCached();
      if (cleanupRoot instanceof HTMLElement) {
        delete cleanupRoot.dataset.tradeMarketPtrRoot;
      }
      resetPull();
      if (getTradeMarketPullRefreshSnapshot().refreshing) {
        patchTradeMarketPullRefresh({ refreshing: false, pullPx: 0 });
      }
    };
  }, [enabled, pathname]);
}
