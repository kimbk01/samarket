import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

/**
 * CONTRACT — `/stores`·`/stores/browse/*` PTR 공통 preflight.
 * - 스크롤 제로 후 각 도메인 핸들러가 캐시·single-flight 무효화·재요청.
 * DO NOT: PTR 핸들러마다 `scrollAppShellToTop` 중복 호출(여기만).
 */
export function preflightStoresDeliveryPtrRefresh(): void {
  scrollAppShellToTop();
}
