import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

/** 장바구니 뒤로가기 폴백 — 히스토리가 없을 때 매장 메뉴(또는 배달 허브) */
export function buildStoreCartBackFallbackHref(storeSlug: string): string {
  const slug = storeSlug.trim();
  if (slug) return `/stores/${encodeURIComponent(slug)}`;
  return "/stores";
}

/**
 * 장바구니 헤더·엣지 스와이프 공통 — 브라우저/앱 **이전 화면(history back)** 우선,
 * 동일 URL 유지·외부 진입 등은 `fallbackHref` 로 복귀.
 */
export function runStoreCartBackNavigation(
  router: { back: () => void; push: (href: string) => void },
  storeSlug: string
): void {
  runHistoryBackWithFallback(router, buildStoreCartBackFallbackHref(storeSlug));
}
