"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { TIER1_HEADER_OVERLAY_OPEN } from "@/lib/layout/tier1-header-overlay-events";
import { BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

/** 패널 우측 슬라이드 — X·스크롤 공통 */
export { FAB_DOCK_MS as MAIN_BOTTOM_NAV_FAB_DOCK_MS } from "@/lib/layout/main-bottom-nav-fab-sector-config";

/** 하단 탭 idle(1.8s) 대비 FAB 자동 펼침 +2s */
export const MAIN_BOTTOM_NAV_FAB_REVEAL_AFTER_SCROLL_IDLE_MS =
  BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS + 2000;

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

/** 스크롤 이동(상·하) → collapsed · 맨 위/idle → expanded (expandLocked 시 자동 펼침 없음) */
export function useMainBottomNavFabSectorScroll(
  enabled: boolean,
  expandLocked: boolean
): {
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
} {
  const [collapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandLockedRef = useRef(expandLocked);
  expandLockedRef.current = expandLocked;

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
      const moved = Math.abs(y - last);
      if (moved > 3) {
        setCollapsed(true);
      }
      if (!expandLockedRef.current && y < 8) {
        setCollapsed(false);
      }
      lastYRef.current = y;

      clearIdle();
      if (!expandLockedRef.current) {
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          setCollapsed(false);
        }, MAIN_BOTTOM_NAV_FAB_REVEAL_AFTER_SCROLL_IDLE_MS);
      }
    };

    const unsub = subscribeAppShellScroll(onScroll, { passive: true });
    return () => {
      unsub();
      clearIdle();
    };
  }, [enabled]);

  useEffect(() => {
    if (expandLocked && idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, [expandLocked]);

  const collapse = useCallback(() => setCollapsed(true), []);
  const expand = useCallback(() => setCollapsed(false), []);

  useEffect(() => {
    if (!enabled) return;
    const onOverlayOpen = () => {
      collapse();
    };
    window.addEventListener(TIER1_HEADER_OVERLAY_OPEN, onOverlayOpen);
    return () => window.removeEventListener(TIER1_HEADER_OVERLAY_OPEN, onOverlayOpen);
  }, [enabled, collapse]);

  return { collapsed, collapse, expand };
}
