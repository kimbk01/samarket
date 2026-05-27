"use client";

import { useEffect, useRef, useState } from "react";
import { resolveBottomNavScrollChromeAction } from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop, subscribeAppShellScroll } from "@/lib/layout/main-app-scroll-root";

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
 * `/stores/browse/*` — 목록 스크롤 시 4단(2차 업종 칩)만 접기. 1·2·3·5단 유지.
 * 아래로 스크롤 시 숨김, 위로·맨 위에서 다시 표시(하단 탭과 동일 임계값).
 */
export function useStoresBrowseHeaderScrollHide(): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    lastYRef.current = getMainAppScrollTop();
    return subscribeAppShellScroll((event) => {
      const y = readScrollTopFromScrollTarget(event.target);
      const action = resolveBottomNavScrollChromeAction(lastYRef.current, y);
      if (action === "hide") setCollapsed(true);
      else if (action === "reveal") setCollapsed(false);
      lastYRef.current = y;
    });
  }, []);

  return collapsed;
}
