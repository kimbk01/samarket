import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

/**
 * 하단 탭 활성 판정 — `BottomNav` 링크·프리페치 후보 제외에 동일 규칙을 쓴다.
 * (`mainBottomNavPrefetchTriggerKey` 는 “셸 도메인”만 맞추면 되고, 여기는 href 접두·거래 `/market` 별칭까지)
 */
export function isBottomNavTabActive(pathname: string | null, tabHref: string): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const h = tabHref.split("?")[0]?.trim() ?? "";
  if (!p || !h) return false;
  if (p === h || p.startsWith(`${h}/`)) return true;
  if (h === "/home" && (p === "/market" || p.startsWith("/market/"))) return true;
  return false;
}

/** 프로그램적 `router.prefetch` 상한 — 비활성 탭 수(기본 4)와 맞춘다 */
export const MAIN_BOTTOM_NAV_PREFETCH_MAX = 4;

/**
 * `BOTTOM_NAV_ITEMS`(또는 운영 탭) 순서대로, **현재 경로와 매칭되지 않는** 탭 href 만 담는다.
 */
export function pickMainBottomNavPrefetchHrefs(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[]
): string[] {
  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (href: string) => {
    const h = href.trim();
    if (!h || seen.has(h)) return;
    if (isBottomNavTabActive(pathname, h)) return;
    seen.add(h);
    out.push(h);
  };

  for (const tab of list) {
    push(tab.href);
    if (out.length >= MAIN_BOTTOM_NAV_PREFETCH_MAX) break;
  }

  return out;
}
