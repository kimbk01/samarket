"use client";

import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { RouteTransitionEnterKind } from "@/components/route-transition/route-transition-config";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";

/**
 * pathname 변경 직후(useLayoutEffect) canonical 방향을 계산해 ref 에 넣는다.
 * 후속 layout effect(예: AppRouteTransition 의 DOM 적용)에서 동일 커밋 안에 읽을 수 있다.
 */
export function useRouteTransitionKindRef(pathname: string | null): MutableRefObject<RouteTransitionEnterKind> {
  const kindRef = useRef<RouteTransitionEnterKind>("none");
  const prevPathRef = useRef<string>("");
  const didHydrateRef = useRef(false);
  const popstateBackRef = useRef(false);
  const lastForwardAxisRef = useRef<"ltr" | "rtl" | null>(null);

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
    });

    kindRef.current = nextKind;
  }, [pathname]);

  return kindRef;
}

/** 계획서 파일명(`useRouteTransitionDirection`)과 동일 역할 별칭 */
export const useRouteTransitionDirection = useRouteTransitionKindRef;
