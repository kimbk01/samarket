"use client";

import { useEffect, useRef, useState } from "react";
import { resolveBottomNavScrollChromeAction } from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { isMessengerCallLogsBottomNavScrollHideSurface } from "@/lib/layout/messenger-call-logs-scroll-chrome-surface";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { isMainAppScrollBodyOverflowing } from "@/lib/ui/store-detail-scroll-root";

/** 마지막 스크롤 이후 이 시간이 지나면 (탭이 접혀 있을 때) 다시 펼침 */
export const BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS = 1800;

function readScrollTopFromScrollTarget(target: EventTarget | null): number {
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
 * `/philife`(헤더 메신저 푸시가 아닐 때)·거래 플로팅면·배달(`/stores`)·내정보 홈·메신저 통화 기록 :
 * 아래로 스크롤 시 하단 탭을 접기.
 */
export function resolveBottomNavScrollHideEnabled(
  pathNoQuery: string,
  headerMessengerFromPhilife: boolean,
  search?: string | null
): boolean {
  if (pathNoQuery === "/philife") return !headerMessengerFromPhilife;
  if (pathNoQuery === "/mypage") return true;
  if (isTradeFloatingMenuSurface(pathNoQuery)) return true;
  if (pathNoQuery === "/stores" || pathNoQuery.startsWith("/stores/")) return true;
  if (isMessengerCallLogsBottomNavScrollHideSurface(pathNoQuery, search)) return true;
  return false;
}

/**
 * `enabled` 가 false 이면 숨김 상태로 리셋(경로 이탈·푸시 열림 등).
 */
export function useBottomNavScrollHide(enabled: boolean): boolean {
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
    lastYRef.current = getMainAppScrollTop();

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

    const onScroll = (event: Event) => {
      const y = readScrollTopFromScrollTarget(event.target);
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
        applyScrollChrome(getMainAppScrollTop());
      }, 100);
    };

    const unsubScroll = subscribeAppShellScroll(onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    applyScrollChrome(lastYRef.current);
    return () => {
      unsubScroll();
      window.removeEventListener("resize", onResize);
      if (resizeTimer != null) clearTimeout(resizeTimer);
      clearIdleReveal();
    };
  }, [enabled]);

  return hidden;
}
