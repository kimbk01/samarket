"use client";

import { useCallback, useRef } from "react";

const DEFAULT_SWIPE_MIN_DX = 56;
const DEFAULT_SWIPE_MAX_DY = 72;

function eventTargetElement(t: EventTarget | null): Element | null {
  if (t == null) return null;
  if (typeof Element !== "undefined" && t instanceof Element) return t;
  if (typeof Node !== "undefined" && t instanceof Node && t.parentElement) return t.parentElement;
  return null;
}

export function useSwipeTabNavigation(
  tabs: Array<{ href: string }>,
  activeIndex: number,
  onNavigate: (href: string) => void,
  opts?: {
    minDx?: number;
    maxDy?: number;
    onEdgeNext?: () => void;
    onEdgePrev?: () => void;
  }
) {
  const minDx = opts?.minDx ?? DEFAULT_SWIPE_MIN_DX;
  const maxDy = opts?.maxDy ?? DEFAULT_SWIPE_MAX_DY;
  const onEdgeNextRef = useRef(opts?.onEdgeNext);
  const onEdgePrevRef = useRef(opts?.onEdgePrev);
  onEdgeNextRef.current = opts?.onEdgeNext;
  onEdgePrevRef.current = opts?.onEdgePrev;
  const touchStartRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, target: e.target };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const startEl = eventTargetElement(start.target);
      if (
        startEl?.closest?.("[data-messenger-friend-row='true']") ||
        startEl?.closest?.("[data-messenger-chat-row='true']")
      ) {
        return;
      }
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < minDx) return;
      if (Math.abs(dy) > maxDy) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (activeIndex < 0) {
        if (dx < 0) onEdgeNextRef.current?.();
        else onEdgePrevRef.current?.();
        return;
      }

      const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
      const nextTab = tabs[nextIndex];
      if (!nextTab) {
        if (dx < 0) onEdgeNextRef.current?.();
        else onEdgePrevRef.current?.();
        return;
      }
      onNavigate(nextTab.href);
    },
    [activeIndex, maxDy, minDx, onNavigate, tabs]
  );

  return {
    onTouchStart,
    onTouchEnd,
  };
}
