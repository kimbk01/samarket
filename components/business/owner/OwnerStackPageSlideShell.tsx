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

function stripOwnerStackTransitionClasses(el: HTMLDivElement | null) {
  if (!el) return;
  for (const c of OWNER_STACK_ROUTE_ENTER_CLASSES) {
    el.classList.remove(c);
  }
}

/**
 * `BusinessAdminShell` 본문 — 허브 「전체 보기」 등 스택 내부 이동 시 270ms 우→좌 / 좌→우.
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
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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

    kindRef.current = computeStoresOwnerStackTransitionKind(prev, pathKey, {
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

  if (!isStoresOwnerStackPath(pathKey)) {
    return <>{children}</>;
  }

  return (
    <div
      ref={hostRef}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        stripOwnerStackTransitionClasses(hostRef.current);
      }}
    >
      {children}
    </div>
  );
}
