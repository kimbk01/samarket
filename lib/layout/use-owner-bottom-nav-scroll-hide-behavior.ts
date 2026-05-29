"use client";

import { useEffect, useRef, useState } from "react";
import { resolveBottomNavScrollChromeAction } from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import {
  getOwnerCompactShellScrollTopSnapshot,
  readOwnerCompactShellScrollTopFromEvent,
  subscribeOwnerCompactShellScroll,
} from "@/lib/layout/subscribe-owner-compact-shell-scroll";
import { BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

/**
 * 매장 오너 compact 셸 — 단일·split 스크롤 루트 모두 반응.
 */
export function useOwnerBottomNavScrollHide(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const idleRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
      setHidden(false);
      return;
    }

    lastYRef.current = getOwnerCompactShellScrollTopSnapshot();

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const onScroll = (event: Event) => {
      const y = readOwnerCompactShellScrollTopFromEvent(event.target);
      if (y == null) return;

      const last = lastYRef.current;
      const action = resolveBottomNavScrollChromeAction(last, y);
      if (action === "hide") {
        setHidden(true);
      } else if (action === "reveal") {
        setHidden(false);
      }
      lastYRef.current = y;

      clearIdleReveal();
      idleRevealTimerRef.current = setTimeout(() => {
        idleRevealTimerRef.current = null;
        setHidden((prev) => (prev ? false : prev));
      }, BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    const unsubScroll = subscribeOwnerCompactShellScroll(onScroll, { passive: true });
    return () => {
      unsubScroll();
      clearIdleReveal();
    };
  }, [enabled]);

  return hidden;
}
