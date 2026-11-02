import { normalizeDeliveryBottomNavPath } from "@/lib/main-menu/delivery-bottom-nav-layout";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

/** 커뮤니티(필라이프) 셸 하단 5탭 — 홈 · 거래 · 배달 · 디바톡 · 내정보 */
export const PHILIFE_BOTTOM_NAV_TAB_IDS = [
  "philife-home-hub",
  "philife-trade",
  "philife-delivery",
  "philife-messenger",
  "philife-my",
] as const;

export type PhilifeBottomNavTabId = (typeof PHILIFE_BOTTOM_NAV_TAB_IDS)[number];

/** 배달 5탭과 동일 라벨 스타일 — `app-bottom-nav.css` `.app-bottom-nav-label--delivery-tab` */
export const PHILIFE_BOTTOM_NAV_LABEL_CLASS =
  "app-bottom-nav-label app-bottom-nav-label--delivery-tab";

export function isPhilifeBottomNavTabId(tabId: string): tabId is PhilifeBottomNavTabId {
  return (PHILIFE_BOTTOM_NAV_TAB_IDS as readonly string[]).includes(tabId);
}

export function isPhilifeBottomNavRail(kind: MainBottomNavSecondaryRailKind): boolean {
  return kind === "philife";
}

/** 커뮤니티 허브 루트(SSOT `isCommunityHomeSurfacePath`) + `/philife/*`·`/community/*` — 커뮤니티 5탭 셸 표면 */
export function isPhilifeConsumerBottomNavSurface(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (isCommunityHomeSurfacePath(p)) return true;
  if (p.startsWith("/philife/") || p.startsWith("/community/")) return true;
  return false;
}

/** 커뮤니티 홈(`/` · `/philife` · `/community`) — 하단 「홈」 탭 활성 */
export function isPhilifeHomeHubBottomNavActive(pathname: string | null): boolean {
  return isPhilifeConsumerBottomNavSurface(pathname);
}

