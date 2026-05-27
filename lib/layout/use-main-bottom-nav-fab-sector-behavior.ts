"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fabScrollHasSettled,
  resolveFabScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { TIER1_HEADER_OVERLAY_OPEN } from "@/lib/layout/tier1-header-overlay-events";
import { BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

/** 패널 우측 슬라이드 — X·스크롤 공통 */
export { FAB_DOCK_MS as MAIN_BOTTOM_NAV_FAB_DOCK_MS } from "@/lib/layout/main-bottom-nav-fab-sector-config";

/** idle 재펼침 — 하단 탭과 동일 1.8s (방향 규칙만 FAB 전용) */
export const MAIN_BOTTOM_NAV_FAB_REVEAL_AFTER_SCROLL_IDLE_MS = BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS;

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

/**
 * FAB 접힘 — 하단 탭과 분리.
 * - 하단 탭: 아래 스크롤 시 숨김 / 위·맨 위 즉시 표시
 * - FAB: 아래·위 스크롤 시 접힘 / 맨 위·idle 1.8s 후 펼침
 */
export function useMainBottomNavFabSectorScroll(
  enabled: boolean,
  expandLocked: boolean
): {
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
} {
  const [scrollCollapsed, setScrollCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastYRef = useRef(0);
  const idleRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandLockedRef = useRef(expandLocked);
  expandLockedRef.current = expandLocked;

  useEffect(() => {
    if (!enabled) {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
      setScrollCollapsed(false);
      setDismissed(false);
      return;
    }
    setScrollCollapsed(false);
    setDismissed(false);
    lastYRef.current = getMainAppScrollTop();

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const scheduleIdleReveal = (snapshotY: number) => {
      if (expandLockedRef.current) return;
      clearIdleReveal();
      idleRevealTimerRef.current = setTimeout(() => {
        idleRevealTimerRef.current = null;
        const settledY = getMainAppScrollTop();
        if (!fabScrollHasSettled(snapshotY, settledY)) return;
        setScrollCollapsed((prev) => (prev ? false : prev));
      }, MAIN_BOTTOM_NAV_FAB_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    const onScroll = (event: Event) => {
      const y = readScrollTop(event.target);
      const last = lastYRef.current;
      const action = resolveFabScrollChromeAction(last, y);

      if (action === "hide") {
        setScrollCollapsed(true);
      } else if (action === "reveal") {
        setScrollCollapsed(false);
        clearIdleReveal();
        lastYRef.current = y;
        return;
      }

      lastYRef.current = y;

      if (expandLockedRef.current) {
        clearIdleReveal();
        return;
      }

      scheduleIdleReveal(y);
    };

    const unsub = subscribeAppShellScroll(onScroll, { passive: true });
    return () => {
      unsub();
      clearIdleReveal();
    };
  }, [enabled]);

  useEffect(() => {
    if (expandLocked && idleRevealTimerRef.current != null) {
      clearTimeout(idleRevealTimerRef.current);
      idleRevealTimerRef.current = null;
    }
  }, [expandLocked]);

  useEffect(() => {
    if (!scrollCollapsed) {
      setDismissed(false);
    }
  }, [scrollCollapsed]);

  const collapsed = enabled && (expandLocked || scrollCollapsed || dismissed);

  const collapse = useCallback(() => {
    if (!enabled) return;
    setDismissed(true);
  }, [enabled]);

  const expand = useCallback(() => {
    if (!enabled) return;
    setDismissed(false);
    setScrollCollapsed(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onOverlayOpen = () => {
      setDismissed(true);
    };
    window.addEventListener(TIER1_HEADER_OVERLAY_OPEN, onOverlayOpen);
    return () => window.removeEventListener(TIER1_HEADER_OVERLAY_OPEN, onOverlayOpen);
  }, [enabled]);

  return { collapsed, collapse, expand };
}
