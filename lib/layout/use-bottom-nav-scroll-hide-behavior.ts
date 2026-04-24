"use client";

import { useEffect, useRef, useState } from "react";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

/** 마지막 스크롤 이후 이 시간이 지나면 (탭이 접혀 있을 때) 다시 펼침 */
const BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS = 1800;

/**
 * `/philife`(헤더 메신저 푸시가 아닐 때)·거래 플로팅면·배달(`/stores`) : 아래로 스크롤 시 하단 탭을 접기.
 */
export function resolveBottomNavScrollHideEnabled(
  pathNoQuery: string,
  headerMessengerFromPhilife: boolean
): boolean {
  if (pathNoQuery === "/philife") return !headerMessengerFromPhilife;
  if (isTradeFloatingMenuSurface(pathNoQuery)) return true;
  if (pathNoQuery === "/stores" || pathNoQuery.startsWith("/stores/")) return true;
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
    lastYRef.current = window.scrollY || document.documentElement.scrollTop;

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const last = lastYRef.current;
      if (y < 8) {
        setHidden(false);
      } else if (y > last + 3) {
        setHidden(true);
      } else if (y < last) {
        setHidden(false);
      }
      lastYRef.current = y;

      clearIdleReveal();
      idleRevealTimerRef.current = setTimeout(() => {
        idleRevealTimerRef.current = null;
        setHidden((prev) => (prev ? false : prev));
      }, BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdleReveal();
    };
  }, [enabled]);

  return hidden;
}
