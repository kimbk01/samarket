"use client";

import {
  isDeliveryListScrollRoute,
  noteDeliveryListScrollBackFromStoreDetail,
} from "@/lib/dibay/delivery-list-scroll-restore";

type StoreDetailRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
};

/**
 * 매장 UI 뒤로가기 — 브라우저 히스토리 대신 fallbackHref 로 직접 이동.
 * browse 목록 복귀 시 저장된 스크롤 복원 플래그를 세팅한다.
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
