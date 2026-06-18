"use client";

import { useEffect, useRef, useState } from "react";
import {
  FAB_SCROLL_MOVE_THRESHOLD_PX,
  FAB_SCROLL_TOP_REVEAL_Y_PX,
  resolveBottomNavScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { isPhilifeNeighborhoodPostDetailPathname } from "@/lib/layout/conditional-app-shell-flags";
import {
  getMainAppScrollRootCached,
  getMainAppScrollTop,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";
import { isMessengerCallLogsBottomNavScrollHideSurface } from "@/lib/layout/messenger-call-logs-scroll-chrome-surface";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  isDocumentScrollRoot,
  isMainAppScrollBodyOverflowing,
} from "@/lib/ui/store-detail-scroll-root";

/** 마지막 스크롤 이후 이 시간이 지나면 (탭이 접혀 있을 때) 다시 펼침 */
export const BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS = 1800;

/**
 * `/philife`(헤더 메신저 푸시가 아닐 때)·거래 플로팅면·배달(`/stores`)·내정보 홈·메신저 통화 기록·친구 목록 :
 * 아래로 스크롤 시 하단 탭을 접기.
 */
export function resolveBottomNavScrollHideEnabled(
  pathNoQuery: string,
  headerMessengerFromPhilife: boolean,
  search?: string | null
): boolean {
  if (pathNoQuery === "/philife") return !headerMessengerFromPhilife;
  if (isPhilifeNeighborhoodPostDetailPathname(pathNoQuery)) return true;
  if (pathNoQuery === "/mypage") return true;
  if (isTradeFloatingMenuSurface(pathNoQuery)) return true;
  if (pathNoQuery === "/stores" || pathNoQuery.startsWith("/stores/")) return true;
  if (isMessengerCallLogsBottomNavScrollHideSurface(pathNoQuery, search)) return true;
  return false;
}

/**
 * `enabled` 가 false 이면 숨김 상태로 리셋(경로 이탈·푸시 열림 등).
 * `routeScrollKey` — pathname+search 변경 시 `lastY` 재동기화(거래 1차 탭·주제 칩 전환).
 */
export function useBottomNavScrollHide(enabled: boolean, routeScrollKey = ""): boolean {
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
    invalidateMainAppScrollRootCache();
    lastYRef.current = getMainAppScrollTop();
    setHidden(false);

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const applyScrollChrome = (y: number) => {
      if (!isMainAppScrollBodyOverflowing()) {
        setHidden(false);
        lastYRef.current = y;
        return;
      }
      const last = lastYRef.current;
      const action = resolveBottomNavScrollChromeAction(last, y);
      if (action === "hide") {
        setHidden(true);
      } else if (action === "reveal") {
        setHidden(false);
      }
      lastYRef.current = y;
    };

    /** 피드 로드·push 후 overflow 생길 때 — 이미 아래로 스크롤한 상태면 즉시 hide */
    const syncScrollChromeFromLayout = () => {
      invalidateMainAppScrollRootCache();
      const y = getMainAppScrollTop();
      if (
        isMainAppScrollBodyOverflowing() &&
        y >= FAB_SCROLL_TOP_REVEAL_Y_PX + FAB_SCROLL_MOVE_THRESHOLD_PX
      ) {
        setHidden(true);
        lastYRef.current = y;
        return;
      }
      applyScrollChrome(y);
    };

    const onScroll = () => {
      const y = getMainAppScrollTop();
      applyScrollChrome(y);

      clearIdleReveal();
      idleRevealTimerRef.current = setTimeout(() => {
        idleRevealTimerRef.current = null;
        setHidden((prev) => (prev ? false : prev));
      }, BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer != null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        syncScrollChromeFromLayout();
      }, 100);
    };

    const unsubScroll = subscribeAppShellScroll(onScroll, {
      passive: true,
      onTargetsChanged: syncScrollChromeFromLayout,
    });
    window.addEventListener("resize", onResize, { passive: true });
    syncScrollChromeFromLayout();

    let syncRaf = 0;
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = window.requestAnimationFrame(() => {
          syncRaf = 0;
          syncScrollChromeFromLayout();
        });
      });
    }

    let scrollRootResizeObserver: ResizeObserver | null = null;
    let observedScrollRoot: HTMLElement | null = null;

    const bindScrollRootResizeObserver = () => {
      invalidateMainAppScrollRootCache();
      let root: HTMLElement;
      try {
        root = getMainAppScrollRootCached();
      } catch {
        return;
      }
      if (isDocumentScrollRoot(root)) {
        scrollRootResizeObserver?.disconnect();
        scrollRootResizeObserver = null;
        observedScrollRoot = null;
        return;
      }
      if (observedScrollRoot === root) return;
      scrollRootResizeObserver?.disconnect();
      observedScrollRoot = root;
      if (typeof ResizeObserver === "undefined") return;
      scrollRootResizeObserver = new ResizeObserver(() => {
        syncScrollChromeFromLayout();
      });
      scrollRootResizeObserver.observe(root);
    };

    bindScrollRootResizeObserver();
    const scrollRootBindTimers = [0, 50, 150, 450].map((ms) =>
      window.setTimeout(bindScrollRootResizeObserver, ms)
    );

    return () => {
      unsubScroll();
      window.removeEventListener("resize", onResize);
      if (resizeTimer != null) clearTimeout(resizeTimer);
      if (syncRaf) window.cancelAnimationFrame(syncRaf);
      for (const timer of scrollRootBindTimers) {
        window.clearTimeout(timer);
      }
      scrollRootResizeObserver?.disconnect();
      observedScrollRoot = null;
      clearIdleReveal();
    };
  }, [enabled, routeScrollKey]);

  return hidden;
}
