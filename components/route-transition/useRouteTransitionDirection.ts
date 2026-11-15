"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { RouteTransitionEnterKind } from "@/components/route-transition/route-transition-config";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import { buildCanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";

/**
 * pathname 변경 직후(useLayoutEffect) canonical 방향을 계산해 ref 에 넣는다.
 *
 * 동적 인덱스: `MainBottomNavTabsProvider` 의 **현재 탭 순서**(admin 변경 즉시 반영) 기반 resolver.
 * Provider 외부(`/admin/*`, `/auth/*` 등)에선 hook 내부 fallback (`BOTTOM_NAV_ITEMS` 코드 기본값)
 * 으로 빌드된 resolver 가 자동 사용 — 이 라우트들은 어차피 `isExcludedFromMainShellTransition`
 * 로 슬라이드 자체가 비활성화되므로 안전하다.
 */
export function useRouteTransitionKindRef(pathname: string | null): MutableRefObject<RouteTransitionEnterKind> {
  const kindRef = useRef<RouteTransitionEnterKind>("none");
  const prevPathRef = useRef<string>("");
  const didHydrateRef = useRef(false);
  const popstateBackRef = useRef(false);
  const lastForwardAxisRef = useRef<"ltr" | "rtl" | null>(null);

  const tabs = useMainBottomNavTabs();
  /**
   * tabs 배열 자체가 매 렌더 새 식별자라도, 동일 순서/내용이면 재빌드 비용이 크지 않다.
   * `BottomNav` 와 같은 Provider 를 보므로 admin 저장 후 storage/이벤트로 갱신되면 즉시 새 resolver 가 잡힌다.
   */
  const resolveIndex = useMemo(() => buildCanonicalNavIndexResolver(tabs), [tabs]);
  /** layout effect 안에서 항상 최신 resolver 를 보도록 ref 동기화 (cycle 사이 race 방지) */
  const resolveIndexRef = useRef(resolveIndex);
  useEffect(() => {
    resolveIndexRef.current = resolveIndex;
  }, [resolveIndex]);

  useEffect(() => {
    const onPopState = () => {
      popstateBackRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useLayoutEffect(() => {
    const pathKey = pathname ?? "";

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      prevPathRef.current = pathKey;
      kindRef.current = "none";
      return;
    }

    const prev = prevPathRef.current;
    if (prev === pathKey) {
      return;
    }

    prevPathRef.current = pathKey;

    const popBack = popstateBackRef.current;
    if (popBack) {
      popstateBackRef.current = false;
    }

    const nextKind = computeRouteTransitionEnterKind(prev, pathKey, {
      popstateBack: popBack,
      lastForwardAxisRef,
      resolveIndex: resolveIndexRef.current,
    });

    kindRef.current = nextKind;
  }, [pathname]);

  return kindRef;
}

/** 계획서 파일명(`useRouteTransitionDirection`)과 동일 역할 별칭 */
export const useRouteTransitionDirection = useRouteTransitionKindRef;
