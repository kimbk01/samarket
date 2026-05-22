import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { OwnerRoutes } from "@/lib/business/owner-routes";

/** 매장 오너 어드민 뒤로가기 폴백 — in-app history 가 없을 때만 사용 */
export function resolveOwnerAdminBackFallbackHref(storeId: string | null | undefined): string {
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (sid) return OwnerRoutes.hub(sid);
  return "/stores/owner";
}

/**
 * 오너 운영 헤더·오버레이 닫기 공통 — **이전 화면(history back) 우선**,
 * URL 이 그대로면 `fallbackHref` 로 이동.
 */
export function runOwnerAdminBackNavigation(
  router: { back: () => void; push: (href: string) => void },
  fallbackHref: string
): void {
  runHistoryBackWithFallback(router, fallbackHref);
}
