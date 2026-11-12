"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  classifyRubberBandTouchMove,
  resolveRubberBandGestureLock,
  rubberBandStretchFromDy,
  shouldBlockNativeOverscroll,
  touchStartedInStoreHeroHorizontalScroller,
  type RubberBandGestureLock,
} from "@/lib/ui/rubber-band-gesture";

export type RubberBandAtDocumentTopOptions = {
  /**
   * 최상단에서 아래로 당길 때 브라우저 **네이티브** 세로 바운스·당김 레이어가 생기지 않게 한다.
   * `touchmove` 를 `passive: false` 로 두고 `preventDefault` — CSS `overscroll-behavior` 와 함께 쓴다.
   */
  blockNativeViewportOverscroll?: boolean;
  /** stretch(px) 변경 시 — 헤더 solid 동결·`data-rubber-stretch-px` 동기화용 */
  onStretchChange?: (px: number) => void;
};

function publishStretch(
  next: number,
  stretchRef: { current: number },
  setStretch: (v: number) => void,
  onStretchChange?: (px: number) => void
): void {
  const rounded = Math.max(0, next);
  if (stretchRef.current === rounded) return;
  stretchRef.current = rounded;
  setStretch(rounded);
  onStretchChange?.(rounded);
}

/**
 * 문서 최상단에서 위로 더 당길 수 없을 때(고무줄), 시각 피드백용 값.
 * 데스크톱: wheel deltaY&lt;0, 터치: 최상단에서 아래로 당김.
 * 매장 히어로 배너 가로 스와이프는 stretch·preventDefault 에서 제외한다.
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
  const gestureLockRef = useRef<RubberBandGestureLock>("none");
  const touchInHeroScrollerRef = useRef(false);

  const onStretchChange = options?.onStretchChange;
  const onStretchChangeRef = useRef(onStretchChange);
  onStretchChangeRef.current = onStretchChange;

  const scheduleDecay = useCallback(() => {
    cancelAnimationFrame(decayRaf.current);
    const tick = () => {
      stretchRef.current *= 0.88;
      if (stretchRef.current < 0.6) {
        publishStretch(0, stretchRef, setStretch, onStretchChangeRef.current);
        return;
      }
      publishStretch(stretchRef.current, stretchRef, setStretch, onStretchChangeRef.current);
      decayRaf.current = requestAnimationFrame(tick);
    };
    decayRaf.current = requestAnimationFrame(tick);
  }, []);

  const blockNativeViewportOverscroll = Boolean(options?.blockNativeViewportOverscroll);

  useEffect(() => {
    const scrollTop = () => getMainAppScrollTop();

    const clearStretch = () => {
      if (stretchRef.current === 0) return;
      publishStretch(0, stretchRef, setStretch, onStretchChangeRef.current);
    };

    const onScroll = () => {
      if (scrollTop() > 14) {
        clearStretch();
      }
    };

    const onWheel: EventListener = (evt) => {
      if (!(evt instanceof WheelEvent)) return;
      if (scrollTop() > 4) return;
      if (evt.deltaY >= 0) return;
      const add = Math.min(18, -evt.deltaY * 0.07);
      publishStretch(
        Math.min(maxStretchPx, stretchRef.current + add),
        stretchRef,
        setStretch,
        onStretchChangeRef.current
      );
      scheduleDecay();
    };

    const onTouchStart = (e: TouchEvent) => {
      gestureLockRef.current = "none";
      touchInHeroScrollerRef.current = false;
      if (scrollTop() > 2) {
        touchStartYRef.current = null;
        touchStartXRef.current = null;
        return;
      }
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
      touchStartXRef.current = e.touches[0]?.clientX ?? null;
      touchInHeroScrollerRef.current = touchStartedInStoreHeroHorizontalScroller(
        e.target
      );
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current == null || touchStartXRef.current == null) return;
      if (scrollTop() > 2) return;

      const y = e.touches[0]?.clientY;
      const x = e.touches[0]?.clientX;
      if (y == null || x == null) return;

      const dy = y - touchStartYRef.current;
      const dx = x - touchStartXRef.current;

      if (touchInHeroScrollerRef.current && gestureLockRef.current === "none") {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > absDy * 1.1 && absDx > 6) {
          gestureLockRef.current = "horizontal";
        }
      }

      const classification = classifyRubberBandTouchMove(
        dx,
        dy,
        gestureLockRef.current
      );
      gestureLockRef.current = resolveRubberBandGestureLock(
        gestureLockRef.current,
        classification
      );

      if (
        blockNativeViewportOverscroll &&
        shouldBlockNativeOverscroll(classification)
      ) {
        e.preventDefault();
      }

      if (classification === "vertical_pull") {
        cancelAnimationFrame(decayRaf.current);
        publishStretch(
          rubberBandStretchFromDy(dy, maxStretchPx),
          stretchRef,
          setStretch,
          onStretchChangeRef.current
        );
      }
    };

    const endTouch = () => {
      if (stretchRef.current > 0) scheduleDecay();
      touchStartYRef.current = null;
      touchStartXRef.current = null;
      gestureLockRef.current = "none";
      touchInHeroScrollerRef.current = false;
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
