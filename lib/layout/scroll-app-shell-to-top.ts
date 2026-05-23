import {
  invalidateStoreDetailScrollRootCache,
  setStoreDetailScrollTop,
} from "@/lib/ui/store-detail-scroll-root";

/**
 * 메인 앱 셸(`ConditionalAppShell`의 `<main>` + 문서 fallback) 스크롤을 최상단으로 맞춤.
 * 하단 탭 전환 시 `next/link` `scroll={false}` 때문에 이전 탭 스크롤이 남지 않도록 한다.
 */
export function scrollAppShellToTop(): void {
  if (typeof document === "undefined") return;
  invalidateStoreDetailScrollRootCache();
  setStoreDetailScrollTop(0, { behavior: "auto" });
  try {
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch {
    window.scrollTo(0, 0);
  }
  try {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch {
    /* noop */
  }
}

/**
 * 라우트 전환 직후 한 프레임 더 스크롤을 맞춤 — Next 레이아웃 적용 뒤 위치가 되살아나는 경우 방지.
 * 같은 탭 재탭은 `scrollAppShellToTop()` 단발만 쓴다(`BottomNav`).
 */
export function scrollAppShellToTopAfterShellNavigation(): void {
  scrollAppShellToTop();
  requestAnimationFrame(() => scrollAppShellToTop());
}
