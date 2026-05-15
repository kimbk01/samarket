"use client";

import { useLayoutEffect, useEffect } from "react";
import {
  ensureDeliveryListManualScrollRestoration,
  getCurrentDeliveryListScrollRouteKey,
  isDeliveryListScrollRoute,
  noteDeliveryListScrollPopstatePending,
  tryRestoreDeliveryListScroll,
} from "@/lib/dibay/delivery-list-scroll-restore";

let popstateListenerInstalled = false;

function ensureDeliveryListScrollPopstateListener(): void {
  if (typeof window === "undefined" || popstateListenerInstalled) return;
  popstateListenerInstalled = true;
  ensureDeliveryListManualScrollRestoration();
  window.addEventListener("popstate", () => {
    const routeKey = getCurrentDeliveryListScrollRouteKey();
    if (isDeliveryListScrollRoute(routeKey)) {
      noteDeliveryListScrollPopstatePending(routeKey);
    }
  });
}

/**
 * 배달 목록 화면 스크롤 복원 — popstate/back 재진입 시에만 적용.
 * @param routeKey pathname+search (미지정 시 현재 location)
 * @param ready 목록 DOM이 그려진 뒤 true (로딩 완료 후)
 */
export function useDeliveryListScrollRestore(routeKey?: string, ready = true): void {
  const resolvedKey =
    routeKey?.trim() ||
    (typeof window !== "undefined" ? getCurrentDeliveryListScrollRouteKey() : "/stores");

  useEffect(() => {
    ensureDeliveryListManualScrollRestoration();
    ensureDeliveryListScrollPopstateListener();
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const routeKey = getCurrentDeliveryListScrollRouteKey();
      if (isDeliveryListScrollRoute(routeKey)) {
        noteDeliveryListScrollPopstatePending(routeKey);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useLayoutEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (!isDeliveryListScrollRoute(resolvedKey)) return;
    tryRestoreDeliveryListScroll(resolvedKey);
  }, [resolvedKey, ready]);
}
