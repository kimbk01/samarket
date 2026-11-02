import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { normalizeDeliveryBottomNavPath } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { isMarketTradeFeedHubPath } from "@/lib/layout/conditional-app-shell-flags";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

/** 거래 셸 하단 5탭 — 홈 · 커뮤니티 · 배달 · 디바톡 · 내정보 */
export const TRADE_BOTTOM_NAV_TAB_IDS = [
  "trade-home-hub",
  "trade-community",
  "trade-delivery",
  "trade-order-chat",
  "trade-my",
] as const;

export type TradeBottomNavTabId = (typeof TRADE_BOTTOM_NAV_TAB_IDS)[number];

export const TRADE_BOTTOM_NAV_LABEL_CLASS =
  "app-bottom-nav-label app-bottom-nav-label--delivery-tab";

export const TRADE_HOME_HUB_HREF = "/market";

export function isTradeBottomNavTabId(tabId: string): tabId is TradeBottomNavTabId {
  return (TRADE_BOTTOM_NAV_TAB_IDS as readonly string[]).includes(tabId);
}

export function isTradeBottomNavRail(kind: MainBottomNavSecondaryRailKind): boolean {
  return kind === "trade";
}

/** `/market` 피드·카테고리 — 거래 5탭 셸(만남 장소 픽 제외) */
export function isTradeConsumerBottomNavSurface(pathname: string | null | undefined): boolean {
  return isMarketTradeFeedHubPath(pathname ?? null);
}

/** 거래 홈(`/market` 계열) — 하단 「홈」 탭 활성 */
export function isTradeHomeHubBottomNavActive(pathname: string | null): boolean {
  return isTradeConsumerBottomNavSurface(pathname);
}

export function isTradeHistoryBottomNavPath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/mypage/trade/chat" || p.startsWith("/mypage/trade/chat/")) return false;
  if (p === MYPAGE_TRADE_FAVORITES_HREF || p.startsWith(`${MYPAGE_TRADE_FAVORITES_HREF}/`)) return false;
  if (p === "/mypage/trade" || p.startsWith("/mypage/trade/")) return true;
  if (p === "/mypage/purchases" || p.startsWith("/mypage/purchases/")) return true;
  if (p === "/mypage/sales" || p.startsWith("/mypage/sales/")) return true;
  return false;
}

export function isTradeFavoritesBottomNavPath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  return p === MYPAGE_TRADE_FAVORITES_HREF || p.startsWith(`${MYPAGE_TRADE_FAVORITES_HREF}/`);
}

