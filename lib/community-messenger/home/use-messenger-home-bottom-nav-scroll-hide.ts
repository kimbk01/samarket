"use client";

import { useEffect, useRef, useState } from "react";

/** 아래로 스크롤 시 캡슐을 접었다가, 유휴 후 다시 펼침(메인 `BottomNav`와 유사, 메신저는 3초) */
const MESSENGER_HOME_BOTTOM_NAV_REVEAL_AFTER_IDLE_MS = 3000;

/**
 * 메신저 허브 전용 하단 캡슐 — `window` / `document.scrollingElement` 스크롤 기준.
 */
export function useMessengerHomeBottomNavScrollHide(enabled: boolean): boolean {
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

    const scrollTop = () => {
      if (typeof document === "undefined") return 0;
      return document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop ?? 0;
    };

    lastYRef.current = scrollTop();

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const onScroll = () => {
      const y = scrollTop();
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
      }, MESSENGER_HOME_BOTTOM_NAV_REVEAL_AFTER_IDLE_MS);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdleReveal();
    };
  }, [enabled]);

  return hidden;
}
