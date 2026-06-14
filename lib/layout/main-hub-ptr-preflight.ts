import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

/** Philife·거래 PTR 공통 — 스크롤 제로 후 각 도메인 핸들러가 캐시 무효화·재요청 */
export function preflightMainHubPtrRefresh(): void {
  scrollAppShellToTop();
}
