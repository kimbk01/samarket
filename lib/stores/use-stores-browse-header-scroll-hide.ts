"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveBottomNavScrollChromeAction,
  type ScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";

function resolveBrowseSubtopicRouteKey(pathname: string | null, subRaw: string | null): string {
  const m = pathname?.match(/^\/stores\/browse\/([^/?]+)/);
  const primary = m?.[1]?.trim().toLowerCase() ?? "";
  const sub = subRaw?.trim().toLowerCase() || "all";
  return `${primary}|${sub}`;
}

/**
 * 4단 접힘 — 공통 델타 판정 + 이미 접힌 뒤 hold 시 setState 생략(훅에서 collapsedRef 와 쌍).
 * @internal vitest
 */
export function resolveBrowseSubtopicScrollChromeAction(
  lastY: number,
  y: number
): ScrollChromeAction {
  return resolveBottomNavScrollChromeAction(lastY, y);
}

/** @internal vitest — scroll Y 한 스텝 hide/reveal/hold 판정 */
export function applyBrowseSubtopicScrollStepForTests(
  lastY: number,
  y: number
): { action: ScrollChromeAction; nextY: number } {
  return { action: resolveBrowseSubtopicScrollChromeAction(lastY, y), nextY: y };
}

/**
 * `/stores/browse/*` — 목록 스크롤 시 4단(2차 업종 칩)만 접기. 1·2·3·5단 유지.
 * 로컬 state + subscribeAppShellScroll (하단 탭 패턴, idle 자동 펼침 없음).
 * Y 는 `event.target` 이 아닌 `[data-main-hub-scroll-body]` 단일 루트만 읽는다
 * (허브 셸 문서 스크롤 fallback 이 0 으로 떨어져 hide/reveal 깜빡임 유발).
 */
export function useStoresBrowseHeaderScrollHide(): boolean {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => resolveBrowseSubtopicRouteKey(pathname, searchParams?.get("sub") ?? null),
    [pathname, searchParams]
  );
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastYRef = useRef(0);

  useLayoutEffect(() => {
    collapsedRef.current = false;
    setCollapsed(false);
    lastYRef.current = getMainAppScrollTop();
  }, [routeKey]);

  useEffect(() => {
    lastYRef.current = getMainAppScrollTop();

    const onScroll = () => {
      const y = getMainAppScrollTop();
      const action = resolveBrowseSubtopicScrollChromeAction(lastYRef.current, y);
      if (action === "hide") {
        if (!collapsedRef.current) {
          collapsedRef.current = true;
          setCollapsed(true);
        }
      } else if (action === "reveal") {
        if (collapsedRef.current) {
          collapsedRef.current = false;
          setCollapsed(false);
        }
      } else if (action === "hold") {
        /* 상태 유지 — 관성·짧은 목록 잔진동에서 hide/reveal 토글·불필요 setState 방지 */
      }
      lastYRef.current = y;
    };

    const unsubScroll = subscribeAppShellScroll(onScroll, { passive: true });
    const onResize = () => {
      lastYRef.current = getMainAppScrollTop();
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      unsubScroll();
      window.removeEventListener("resize", onResize);
    };
  }, [routeKey]);

  return collapsed;
}
