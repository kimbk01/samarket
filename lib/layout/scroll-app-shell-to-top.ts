import {
  invalidateStoreDetailScrollRootCache,
  setStoreDetailScrollTop,
} from "@/lib/ui/store-detail-scroll-root";
import { APP_SCROLL_OWNER_ATTR } from "@/lib/navigation/app-scroll-memory";

/**
 * 메인 앱 셸(`ConditionalAppShell`의 `<main>` + 문서 fallback) 스크롤을 최상단으로 맞춤 — 현재 탭 다시 누르기(P3).
 * 자체 스크롤 상자를 가진 화면(메신저 목록 `data-app-scroll-owner`)도 같이 맨 위로 (2026-11-03 스크롤 SSOT T-2).
 * 화면 이동 시 위치는 `AppScrollMemory` 가 정한다.
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
  for (const el of document.querySelectorAll<HTMLElement>(`[${APP_SCROLL_OWNER_ATTR}]`)) {
    el.scrollTop = 0;
  }
}
