"use client";

import { markAppScrollNavIntent } from "@/lib/navigation/app-scroll-memory";

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
  /** 목록 위치 복원은 앱 공용 규칙 — 뒤로 신호만 남긴다 (스크롤 SSOT 2026-11-03) */
  markAppScrollNavIntent("back");
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
