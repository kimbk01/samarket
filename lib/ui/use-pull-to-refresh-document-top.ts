"use client";

import { useEffect, useRef, useState } from "react";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";

const DEFAULT_THRESHOLD_PX = 52;

function scrollTopY(): number {
  return getMainAppScrollTop();
}

/**
 * 문서가 맨 위일 때 세로로 아래로 당기면 `onRefresh` 실행 (모바일 웹 P2R).
 * `touchmove` 는 당김이 감지된 뒤에만 `passive: false` 로 등록한다.
 */
export function usePullToRefreshAtDocumentTop(
  onRefresh: () => Promise<void>,
  options?: { enabled?: boolean; thresholdPx?: number }
) {
  const enabled = options?.enabled !== false;
  const threshold = options?.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const moveHandlerRef = useRef<((e: TouchEvent) => void) | null>(null);

  const removeMove = () => {
    const h = moveHandlerRef.current;
    if (h) {
      window.removeEventListener("touchmove", h);
      moveHandlerRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      removeMove();
      if (scrollTopY() > 2) return;
      startYRef.current = e.touches[0]?.clientY ?? null;
      if (startYRef.current == null) return;

      const onMove = (ev: TouchEvent) => {
        if (scrollTopY() > 2) {
          removeMove();
          pullRef.current = 0;
          setPullPx(0);
          return;
        }
        const y0 = startYRef.current;
        if (y0 == null) return;
        const y = ev.touches[0]?.clientY;
        if (y == null) return;
        const dy = y - y0;
        if (dy > 8) {
          try {
            ev.preventDefault();
          } catch {
            /* noop */
          }
        }
        if (dy > 0) {
          const damped = Math.min(dy * 0.42, 100);
          pullRef.current = damped;
          setPullPx(damped);
        } else {
          pullRef.current = 0;
          setPullPx(0);
        }
      };

      moveHandlerRef.current = onMove;
      window.addEventListener("touchmove", onMove, { passive: false });
    };

    const runRefresh = () => {
      if (refreshingRef.current) {
        setPullPx(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullPx(0);
      pullRef.current = 0;
      void (async () => {
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      })();
    };

    const onEnd = () => {
      removeMove();
      startYRef.current = null;
      const p = pullRef.current;
      pullRef.current = 0;
      if (p >= threshold) {
        runRefresh();
      }
      setPullPx(0);
    };

    const unsubScroll = subscribeAppShellScroll(() => {
      if (scrollTopY() > 2) {
        removeMove();
        pullRef.current = 0;
        setPullPx(0);
      }
    });

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      unsubScroll();
      removeMove();
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, threshold]);

  return {
    pullPx,
    refreshing,
    /** 임계값 이상이면 놓을 때 새로고침 */
    willReleaseRefresh: pullPx >= threshold,
  };
}