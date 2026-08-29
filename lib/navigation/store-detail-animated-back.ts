"use client";

import {
  isDeliveryListScrollRoute,
  noteDeliveryListScrollBackFromStoreDetail,
} from "@/lib/dibay/delivery-list-scroll-restore";

type StoreDetailRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * 매장 UI 뒤로가기 — @deprecated Prefer resolveDibayBackTarget + runDibayBackResolution.
 * Kept for non-cutover callers; Delivery store header uses resolver adapter.
 */
export function runStoreDetailDirectBack(
  router: StoreDetailRouter,
  fallbackHref: string,
  animatedBack: ((navigate: () => void) => void) | null
): void {
  const path = (fallbackHref || "").split("?")[0] ?? "";
  if (isDeliveryListScrollRoute(path) || isDeliveryListScrollRoute(fallbackHref)) {
    noteDeliveryListScrollBackFromStoreDetail(fallbackHref);
  }
  const navigate = () => router.push(fallbackHref, { scroll: false });
  if (animatedBack) {
    animatedBack(navigate);
    return;
  }
  navigate();
}

/** @deprecated 매장 소비자 UI는 `runStoreDetailDirectBack` 사용 */
export function runStoreDetailHistoryBackWithFallback(
  router: StoreDetailRouter & { back: () => void },
  fallbackHref: string | undefined,
  animatedBack: ((navigate: () => void) => void) | null
): void {
  if (fallbackHref) {
    runStoreDetailDirectBack(router, fallbackHref, animatedBack);
    return;
  }
  const navigate = () => router.back();
  if (animatedBack) {
    animatedBack(navigate);
    return;
  }
  navigate();
}
