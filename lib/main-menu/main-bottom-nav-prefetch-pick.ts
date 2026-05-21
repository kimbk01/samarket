import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { bottomNavMessengerHrefWithOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import {
  resolveMainBottomNavPickTabActiveOptions,
  type MainBottomNavPickContext,
} from "@/lib/main-menu/main-bottom-nav-pick-context";

/**
 * `/community-messenger` 셸 — 교차 탭 RSC idle 프리페치 생략 판별용(미사용 preload·현재 화면과 네트워크 경쟁 완화).
 */
export function isMainBottomNavMessengerShellPathname(pathname: string | null): boolean {
  const raw = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const p = raw.replace(/\/+$/, "") || "/";
  return p === "/community-messenger" || p.startsWith("/community-messenger/");
}

/**
 * 프로그램적 `router.prefetch`·클라 prewarm 에 쓰는 href — 탭 링크(`BottomNavTab*`) 과 동일 규칙.
 * - 메신저: 현재 경로 기준 `?from=` 부착 (`BottomNavTabStandard` 의 `effectiveHref` 와 정합)
 */
export function resolveBottomNavTabProgrammaticPrefetchHref(
  tab: BottomNavItemConfig,
  pathname: string | null,
  ctx?: MainBottomNavPickContext
): string {
  if (tab.id === "delivery-orders") {
    return resolveDeliveryOrderHistoryHref(ctx?.ownerStoreId);
  }
  if (tab.id === "chat") {
    return bottomNavMessengerHrefWithOrigin(tab.href, pathname, ctx?.searchParams);
  }
  return tab.href;
}

/**
 * 하단 탭 활성 판정 — `BottomNav` 링크·프리페치 후보 제외에 동일 규칙을 쓴다.
 * (`mainBottomNavPrefetchTriggerKey` 는 “셸 도메인”만 맞추면 되고, 여기는 href 접두·거래 `/market` 별칭까지)
 */
export function isBottomNavTabActive(pathname: string | null, tabHref: string): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const h = tabHref.split("?")[0]?.trim() ?? "";
  if (!p || !h) return false;
  if (p === h || p.startsWith(`${h}/`)) return true;
  return false;
}

/**
 * 하단 탭 배열에서 현재 경로에 해당하는 탭 인덱스. 없으면 `-1`.
 * 탭 간 전환 애니메이션 방향(좌↔우) 판별에 사용.
 */
export function resolveActiveMainBottomNavTabIndex(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[],
  ctx?: MainBottomNavPickContext
): number {
  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const activeOpts = resolveMainBottomNavPickTabActiveOptions(pathname, ctx);
  for (let i = 0; i < list.length; i++) {
    if (isMainBottomNavDisplayTabActive(pathname, list[i]!, activeOpts)) return i;
  }
  return -1;
}

/** 프로그램적 `router.prefetch` 상한 — 비활성 탭 수(기본 4)와 맞춘다 */
export const MAIN_BOTTOM_NAV_PREFETCH_MAX = 4;

/**
 * `BOTTOM_NAV_ITEMS`(또는 운영 탭) 순서대로, **현재 경로와 매칭되지 않는** 탭 href 만 담는다.
 */
export function pickMainBottomNavPrefetchHrefs(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[],
  ctx?: MainBottomNavPickContext
): string[] {
  if (isMainBottomNavMessengerShellPathname(pathname)) return [];
  /** 매장 운영 허브 — 현재 화면 데이터·Realtime만; 타 탭 RSC·philife feed prewarm 금지 */
  if (mainBottomNavPrefetchTriggerKey(pathname) === "store_owner") return [];

  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const out: string[] = [];
  const seen = new Set<string>();
  const activeOpts = resolveMainBottomNavPickTabActiveOptions(pathname, ctx);

  for (const tab of list) {
    if (isMainBottomNavDisplayTabActive(pathname, tab, activeOpts)) continue;
    const href = resolveBottomNavTabProgrammaticPrefetchHref(tab, pathname, ctx).trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAIN_BOTTOM_NAV_PREFETCH_MAX) break;
  }

  return out;
}
