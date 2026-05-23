"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";

export type RubberBandAtDocumentTopOptions = {
  /**
   * 최상단에서 아래로 당길 때 브라우저 **네이티브** 세로 바운스·당김 레이어가 생기지 않게 한다.
   * `touchmove` 를 `passive: false` 로 두고 `preventDefault` — CSS `overscroll-behavior` 와 함께 쓴다.
   */
  blockNativeViewportOverscroll?: boolean;
};

/**
 * 문서 최상단에서 위로 더 당길 수 없을 때(고무줄), 시각 피드백용 값.
 * 데스크톱: wheel deltaY&lt;0, 터치: 최상단에서 아래로 당김.
 */
export function useRubberBandAtDocumentTop(
  maxStretchPx = 90,
  options?: RubberBandAtDocumentTopOptions
) {
  const [stretch, setStretch] = useState(0);
  const stretchRef = useRef(0);
  const decayRaf = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const scheduleDecay = useCallback(() => {
    cancelAnimationFrame(decayRaf.current);
    const tick = () => {
      stretchRef.current *= 0.88;
      if (stretchRef.current < 0.6) {
        stretchRef.current = 0;
        setStretch(0);
        return;
      }
      setStretch(stretchRef.current);
      decayRaf.current = requestAnimationFrame(tick);
    };
    decayRaf.current = requestAnimationFrame(tick);
  }, []);

  const blockNativeViewportOverscroll = Boolean(options?.blockNativeViewportOverscroll);

  useEffect(() => {
    const scrollTop = () => getMainAppScrollTop();

    const onScroll = () => {
      if (scrollTop() > 14) {
        stretchRef.current = 0;
        setStretch(0);
      }
    };

    const onWheel: EventListener = (evt) => {
      if (!(evt instanceof WheelEvent)) return;
      if (scrollTop() > 4) return;
      if (evt.deltaY >= 0) return;
      const add = Math.min(18, -evt.deltaY * 0.07);
      stretchRef.current = Math.min(maxStretchPx, stretchRef.current + add);
      setStretch(stretchRef.current);
      scheduleDecay();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (scrollTop() > 2) {
        touchStartYRef.current = null;
        touchStartXRef.current = null;
        return;
      }
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
      touchStartXRef.current = e.touches[0]?.clientX ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current == null || touchStartXRef.current == null) return;
      if (scrollTop() > 2) return;
      const y = e.touches[0]?.clientY;
      const x = e.touches[0]?.clientX;
      if (y == null || x == null) return;
      const dy = y - touchStartYRef.current;
      const dx = x - touchStartXRef.current;
      /** 가로 스크롤(카테고리 칩 등)과 구분 — 세로 아래 당김이 우세할 때만 네이티브 바운스 차단 */
      const verticalPullDominant = dy > 4 && dy >= Math.abs(dx) * 0.85;
      if (verticalPullDominant && blockNativeViewportOverscroll) {
        e.preventDefault();
      }
      if (dy > 0) {
        cancelAnimationFrame(decayRaf.current);
        stretchRef.current = Math.min(maxStretchPx, dy * 0.58);
        setStretch(stretchRef.current);
      }
    };

    const endTouch = () => {
      if (stretchRef.current > 0) scheduleDecay();
      touchStartYRef.current = null;
      touchStartXRef.current = null;
    };

    const unsubScroll = subscribeAppShellScroll(onScroll, { passive: true });
    const scrollRoot = getMainAppScrollRoot();
    const wheelTarget: EventTarget = scrollRoot ?? window;
    wheelTarget.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: !blockNativeViewportOverscroll });
    window.addEventListener("touchend", endTouch);
    window.addEventListener("touchcancel", endTouch);

    return () => {
      unsubScroll();
      wheelTarget.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", endTouch);
      window.removeEventListener("touchcancel", endTouch);
      cancelAnimationFrame(decayRaf.current);
    };
  }, [blockNativeViewportOverscroll, maxStretchPx, scheduleDecay]);

  const scale = 1 + Math.min(stretch / 420, 0.085);
  return { stretch, scale };
}
