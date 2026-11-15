"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ownerStackRouteTransitionClassForKind,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import { computeStoresOwnerStackTransitionKind } from "@/components/route-transition/route-transition-enter-kind";
import { OWNER_STACK_ROUTE_ENTER_CLASSES } from "@/lib/business/owner-stack-page-slide";
import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";
import { consumeOwnerBottomNavTabIntent } from "@/lib/business/owner-bottom-nav-tab-intent";
import { useBottomNavShowingTarget } from "@/lib/main-menu/use-bottom-nav-controller";
import { OwnerTabSkeleton, resolveOwnerTabSkeletonKind } from "@/components/business/owner/OwnerTabSkeleton";
import { subscribePopstateBeforeRouter } from "@/lib/navigation/popstate-before-router";

function stripOwnerStackTransitionClasses(el: HTMLDivElement | null) {
  if (!el) return;
  for (const c of OWNER_STACK_ROUTE_ENTER_CLASSES) {
    el.classList.remove(c);
  }
}

/**
 * `BusinessAdminShell` 본문 — 허브 「전체 보기」 등 스택 내부 이동 시 270ms 우→좌 / 좌→우.
 * 하단 탭으로 옮긴 이동은 슬라이드 없음(하단 탭 계약 v2 S5 — `owner-bottom-nav-tab-intent`).
 * 메인 `AppRouteTransition` 과 이중 슬라이드 되지 않도록 `shouldSuppressOwnerStackMainShellSlide` 와 짝.
 */
export function OwnerStackPageSlideShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<RouteTransitionEnterKind>("none");
  const prevPathRef = useRef("");
  const didHydrateRef = useRef(false);
  const popstateBackRef = useRef(false);
  const lastForwardAxisRef = useRef<"ltr" | "rtl" | null>(null);

  const pathKey = pathname ?? "";

  useEffect(() => {
    const onPopState = () => {
      popstateBackRef.current = true;
    };
    const offPopBefore = subscribePopstateBeforeRouter(onPopState);
    return () => offPopBefore();
  }, []);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      prevPathRef.current = pathKey;
      kindRef.current = "none";
      return;
    }

    const prev = prevPathRef.current;
    if (prev === pathKey) return;

    prevPathRef.current = pathKey;

    const popBack = popstateBackRef.current;
    if (popBack) popstateBackRef.current = false;

    /** 사장님 하단 탭으로 옮긴 이동 = 연출 없이 즉시 교체 (하단 탭 계약 v2 S5) */
    const fromBottomNavTab = !popBack && consumeOwnerBottomNavTabIntent(pathKey);
    kindRef.current = fromBottomNavTab
      ? "none"
      : computeStoresOwnerStackTransitionKind(prev, pathKey, {
          popstateBack: popBack,
          lastForwardAxisRef,
        });

    stripOwnerStackTransitionClasses(el);
    try {
      el.getAnimations().forEach((a) => a.cancel());
    } catch {
      /* ignore */
    }

    el.dataset.ownerStackTransitionKind = kindRef.current;
    const cls = ownerStackRouteTransitionClassForKind(kindRef.current);
    if (!cls) return;

    void el.offsetWidth;
    const raf = requestAnimationFrame(() => {
      hostRef.current?.classList.add(cls);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathKey]);

  /**
   * 사장님 하단 탭 즉시 교체 (하단 탭 계약 v2 · Owner 2026-11-15 「사장님 뼈대 신설」):
   * 손 뗀 프레임부터 Next 경로 확정 전까지 지금 화면은 숨기고(언마운트하지 않음) 목적 화면 뼈대를 보인다.
   */
  const showing = useBottomNavShowingTarget();
  const normalizedPath = pathKey.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const skeletonKind =
    showing && showing.path !== normalizedPath ? resolveOwnerTabSkeletonKind(showing.path) : null;

  if (!isStoresOwnerStackPath(pathKey)) {
    return <>{children}</>;
  }

  return (
    <div
      ref={hostRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        stripOwnerStackTransitionClasses(hostRef.current);
      }}
    >
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={skeletonKind ? { display: "none" } : undefined}
      >
        {children}
      </div>
      {skeletonKind ? <OwnerTabSkeleton kind={skeletonKind} /> : null}
    </div>
  );
}
