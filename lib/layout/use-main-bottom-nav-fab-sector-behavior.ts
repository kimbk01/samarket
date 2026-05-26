"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

/** 패널 우측 슬라이드 — X·스크롤 공통 */
export { FAB_DOCK_MS as MAIN_BOTTOM_NAV_FAB_DOCK_MS } from "@/lib/layout/main-bottom-nav-fab-sector-config";

function readScrollTop(target: EventTarget | null): number {
  if (target instanceof Element) {
    const el =
      target === document.documentElement ?
        (document.scrollingElement ?? document.documentElement)
      : target;
    if (
      el instanceof HTMLElement &&
      el !== document.body &&
      (el.scrollHeight > el.clientHeight + 1 || el === document.scrollingElement)
    ) {
      return el.scrollTop;
    }
  }
  return window.scrollY || document.documentElement.scrollTop;
}

/** 스크롤 다운 → collapsed · 업/idle → expanded */
export function useMainBottomNavFabSectorScroll(enabled: boolean): {
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
} {
  const [collapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setCollapsed(false);
      return;
    }
    setCollapsed(false);
    lastYRef.current = getMainAppScrollTop();

    const clearIdle = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const onScroll = (event: Event) => {
      const y = readScrollTop(event.target);
      const last = lastYRef.current;
      if (y < 8) {
        setCollapsed(false);
      } else if (y > last + 3) {
        setCollapsed(true);
      } else if (y < last) {
        setCollapsed(false);
      }
      lastYRef.current = y;

      clearIdle();
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        setCollapsed(false);
      }, BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    const unsub = subscribeAppShellScroll(onScroll, { passive: true });
    return () => {
      unsub();
      clearIdle();
    };
  }, [enabled]);

  const collapse = useCallback(() => setCollapsed(true), []);
  const expand = useCallback(() => setCollapsed(false), []);

  return { collapsed, collapse, expand };
}
