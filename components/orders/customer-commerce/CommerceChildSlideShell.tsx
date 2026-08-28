"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { RouteTransitionEnterKind } from "@/components/route-transition/route-transition-config";
import {
  COMMERCE_CHILD_ROUTE_ENTER_CLASSES,
  commerceChildRouteTransitionClassForKind,
  computeCommerceChildTransitionKind,
  isCommerceConsumerChildSlideHostPath,
} from "@/lib/delivery/customer/commerce-child-page-slide";

function stripCommerceChildTransitionClasses(el: HTMLDivElement | null) {
  if (!el) return;
  for (const c of COMMERCE_CHILD_ROUTE_ENTER_CLASSES) {
    el.classList.remove(c);
  }
}

/**
 * Gift mall / owned instance child navigation — 440ms RTL push / LTR pop.
 * Pairs with `shouldSuppressCommerceConsumerMainShellSlide` (no double slide).
 */
export function CommerceChildSlideShell({ children }: { children: ReactNode }) {
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

    kindRef.current = computeCommerceChildTransitionKind(prev, pathKey, {
      popstateBack: popBack,
      lastForwardAxisRef,
    });

    stripCommerceChildTransitionClasses(el);
    try {
      el.getAnimations().forEach((a) => a.cancel());
    } catch {
      /* ignore */
    }

    el.dataset.commerceChildTransitionKind = kindRef.current;
    const cls = commerceChildRouteTransitionClassForKind(kindRef.current);
    if (!cls) return;

    void el.offsetWidth;
    const raf = requestAnimationFrame(() => {
      hostRef.current?.classList.add(cls);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathKey]);

  if (!isCommerceConsumerChildSlideHostPath(pathKey)) {
    return <>{children}</>;
  }

  return (
    <div
      ref={hostRef}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
      data-commerce-child-slide-shell="1"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        stripCommerceChildTransitionClasses(hostRef.current);
      }}
    >
      {children}
    </div>
  );
}
