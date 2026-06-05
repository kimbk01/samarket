"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveBottomNavScrollChromeAction,
  type ScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";

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

function resolveBrowseSubtopicRouteKey(pathname: string | null, subRaw: string | null): string {
  const m = pathname?.match(/^\/stores\/browse\/([^/?]+)/);
  const primary = m?.[1]?.trim().toLowerCase() ?? "";
  const sub = subRaw?.trim().toLowerCase() || "all";
  return `${primary}|${sub}`;
}

/** @internal vitest — scroll Y 한 스텝 hide/reveal/hold 판정 */
export function applyBrowseSubtopicScrollStepForTests(
  lastY: number,
  y: number
): { action: ScrollChromeAction; nextY: number } {
  return { action: resolveBottomNavScrollChromeAction(lastY, y), nextY: y };
}

/**
 * `/stores/browse/*` — 목록 스크롤 시 4단(2차 업종 칩)만 접기. 1·2·3·5단 유지.
 * 로컬 state + subscribeAppShellScroll (하단 탭 패턴, idle 자동 펼침 없음).
 */
export function useStoresBrowseHeaderScrollHide(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => resolveBrowseSubtopicRouteKey(pathname, searchParams?.get("sub") ?? null),
    [pathname, searchParams]
  );
  const [collapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);

  useLayoutEffect(() => {
    setCollapsed(false);
    lastYRef.current = getMainAppScrollTop();
  }, [routeKey]);

  useEffect(() => {
    lastYRef.current = getMainAppScrollTop();

    const onScroll = (event: Event) => {
      const y = readScrollTopFromScrollTarget(event.target);
      const action = resolveBottomNavScrollChromeAction(lastYRef.current, y);
      if (action === "hide") {
        setCollapsed(true);
      } else if (action === "reveal") {
        setCollapsed(false);
      }
      lastYRef.current = y;
    };

    return subscribeAppShellScroll(onScroll, { passive: true });
  }, [routeKey]);

  return collapsed;
}
