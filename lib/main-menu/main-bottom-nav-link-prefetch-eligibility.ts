import { isCommunityHomeSurfacePath, isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

/**
 * 하단 탭 Link `prefetch` 대상 — 비활성 MAIN 허브 루트만 (첫 탭 진입이 콜드가 되지 않게).
 * `BottomNav` Link 와 복귀 재준비(`bottom-nav-resume-rewarm`)가 같은 규칙을 쓴다(단일 정의).
 */
export function shouldPrefetchMainBottomNavHref(href: string, isActive: boolean): boolean {
  if (isActive) return false;
  const path = (href.split("?")[0] ?? "").trim().replace(/\/+$/, "") || "/";
  if (isHomeSurfacePath(path)) return true;
  if (isCommunityHomeSurfacePath(path)) return true;
  if (path === "/market" || path === "/stores" || path === "/mypage") return true;
  if (path === "/community-messenger") return true;
  return false;
}
