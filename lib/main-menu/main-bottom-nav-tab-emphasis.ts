import {
  isMainBottomNavUnifiedInboxTabId,
  mainBottomNavGlobalInboxTabHref,
} from "@/lib/community-messenger/messenger-entry-origin";
import {
  isMainBottomNavHubEmphasisTab,
  resolveMainBottomNavHubDomain,
  resolveMainBottomNavHubHomeHref,
  type MainBottomNavHubDomain,
} from "@/lib/main-menu/main-bottom-nav-domain";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";
import { peekTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";

export type MainBottomNavTabEmphasisKind = "domain-hub" | "messenger-hub" | null;

/**
 * CONTRACT — orbit 강조·탭 tap href 단일 소스.
 * DO NOT: `BottomNav`·guard·prefetch 에서 emphasis/inbox/orders 분기를 따로 복제.
 * domain-hub / messenger-hub → 집 orbit 짧은 탭(허브 홈·인박스 `section=chats`).
 */

function normalizePathKey(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

export function isMainBottomNavMessengerShellPath(pathname: string | null | undefined): boolean {
  const p = normalizePathKey(pathname);
  return p === "/community-messenger" || p.startsWith("/community-messenger/");
}

/** 메신저 셸 — chat·레거시 chat 슬롯 orbit 강조 */
export function isMainBottomNavMessengerEmphasisTab(
  tabId: string,
  pathname: string | null | undefined
): boolean {
  if (!isMainBottomNavUnifiedInboxTabId(tabId)) return false;
  return isMainBottomNavMessengerShellPath(pathname);
}

/**
 * 하단 탭 orbit 강조 — domain-hub / messenger-hub 모두 **집 아이콘·허브 홈** 짧은 탭.
 * `pendingChatNav` — chat 탭 눌림 직후 pathname 갱신 전 orbit 선표시.
 */
export function resolveMainBottomNavTabEmphasisKind(
  tabId: string,
  pathname: string | null | undefined,
  options?: {
    hubDomain?: MainBottomNavHubDomain | null;
    pendingChatNav?: boolean;
  }
): MainBottomNavTabEmphasisKind {
  const hubDomain = options?.hubDomain ?? resolveMainBottomNavHubDomain(pathname);
  if (isMainBottomNavHubEmphasisTab(tabId, hubDomain)) return "domain-hub";
  if (options?.pendingChatNav && isMainBottomNavUnifiedInboxTabId(tabId)) return "messenger-hub";
  if (isMainBottomNavMessengerEmphasisTab(tabId, pathname)) return "messenger-hub";
  return null;
}

/** orbit 강조 탭 짧은 탭 — 허브 홈 / 메신저 전체 인박스 */
export function resolveMainBottomNavEmphasisTapHref(
  tabId: string,
  emphasisKind: MainBottomNavTabEmphasisKind,
  pathname: string | null | undefined,
  searchParams?: { get: (key: string) => string | null } | null
): string | null {
  if (emphasisKind === "domain-hub") {
    return resolveMainBottomNavHubHomeHref(tabId);
  }
  if (emphasisKind === "messenger-hub" && isMainBottomNavUnifiedInboxTabId(tabId)) {
    return mainBottomNavGlobalInboxTabHref(pathname, searchParams);
  }
  return null;
}

/** 하단 탭 Link href·guard·commit 공통 — `emphasisKind` 반영 */
export function resolveMainBottomNavTabTapHref(
  tabId: string,
  tabHref: string,
  options?: {
    emphasisKind?: MainBottomNavTabEmphasisKind;
    pathname?: string | null;
    searchParams?: { get: (key: string) => string | null } | null;
    ownerStoreId?: string | null;
  }
): string {
  const emphasisKind = options?.emphasisKind ?? null;
  const pathname = options?.pathname ?? null;
  const searchParams = options?.searchParams ?? null;
  const emphasisHome = resolveMainBottomNavEmphasisTapHref(
    tabId,
    emphasisKind,
    pathname,
    searchParams
  );
  if (emphasisHome) return emphasisHome;
  if (tabId === "delivery-orders") {
    return resolveDeliveryOrderHistoryHref(options?.ownerStoreId ?? undefined);
  }
  if (isMainBottomNavUnifiedInboxTabId(tabId)) {
    return mainBottomNavGlobalInboxTabHref(pathname, searchParams);
  }
  if (
    tabId === "community" ||
    tabId === "philife-home-hub" ||
    tabId === "philife"
  ) {
    return resolveCommunityBottomNavEntryHref(tabHref, { fromPathname: pathname });
  }
  // Market 탭: 마지막 탐색 URL(q/category/sort/tradeState/priceMin/priceMax/location) 복귀
  if (tabId === "home" && tabHref.startsWith("/market")) {
    return peekTradeListReturnHref() ?? tabHref;
  }
  return tabHref;
}
