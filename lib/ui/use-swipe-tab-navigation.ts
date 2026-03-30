"use client";

import { useCallback, useRef } from "react";

const DEFAULT_SWIPE_MIN_DX = 56;
const DEFAULT_SWIPE_MAX_DY = 72;

export function useSwipeTabNavigation(
  tabs: Array<{ href: string }>,
  activeIndex: number,
  onNavigate: (href: string) => void,
  minDx = DEFAULT_SWIPE_MIN_DX,
  maxDy = DEFAULT_SWIPE_MAX_DY
) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < minDx) return;
      if (Math.abs(dy) > maxDy) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (activeIndex < 0) return;

      const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      onNavigate(nextTab.href);
    },
    [activeIndex, maxDy, minDx, onNavigate, tabs]
  );

  return {
    onTouchStart,
    onTouchEnd,
  };
}
