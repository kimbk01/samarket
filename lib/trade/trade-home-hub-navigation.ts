import { isTradeHomeHubBottomNavActive } from "@/lib/main-menu/trade-bottom-nav-layout";
import {
  commitMainBottomNavRoute,
  type MainBottomNavRouteCommitArgs,
} from "@/lib/main-menu/main-bottom-nav-route-commit";
import { TRADE_HOME_HUB_HREF } from "@/lib/main-menu/trade-bottom-nav-layout";

/** 롱프레스 — 거래 홈(`/market`) 이동(이미 실홈이면 맨 위 스크롤) */
export const TRADE_HOME_HUB_LONG_PRESS_MS = 480;

export type TradeHomeHubNavigateArgs = {
  pathname: string | null;
  currentSearch: string;
  href?: string;
  switcherOpen: boolean;
  onCloseSwitcher: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
  push: (href: string) => void;
  replace: (href: string) => void;
  prefetch?: (href: string) => void;
  onPrewarm?: () => void;
};

export type TradeHomeHubShortTapArgs = TradeHomeHubNavigateArgs & {
  longPressFired: boolean;
  onToggleSwitcher: () => void;
};

function tradeHomeHubHref(args: TradeHomeHubNavigateArgs): string {
  return (args.href ?? TRADE_HOME_HUB_HREF).trim() || TRADE_HOME_HUB_HREF;
}

function baseCommitArgs(args: TradeHomeHubNavigateArgs): Omit<
  MainBottomNavRouteCommitArgs,
  "href" | "tabId"
> {
  return {
    pathname: args.pathname,
    currentSearch: args.currentSearch,
    beginMenuNavigation: args.beginMenuNavigation,
    onNavigationIntent: args.onNavigationIntent,
    guardBeforeNavigate: args.guardBeforeNavigate,
    push: args.push,
    replace: args.replace,
    prefetch: args.prefetch,
    onPrewarm: args.onPrewarm,
    onCloseDomainSwitcher: args.switcherOpen ? args.onCloseSwitcher : undefined,
  };
}

/** 롱프레스 — `/market`(동일 페이지면 스크롤만) */
export function runTradeHomeHubNavigateToMarket(args: TradeHomeHubNavigateArgs): boolean {
  const href = tradeHomeHubHref(args);
  const result = commitMainBottomNavRoute({
    ...baseCommitArgs(args),
    href,
    tabId: "trade-home-hub",
    prefetchWhenInactive: !shouldSkipTradeHomeHubPrewarm(args.pathname, href),
  });
  return result !== "blocked";
}

function shouldSkipTradeHomeHubPrewarm(pathname: string | null, href: string): boolean {
  if (!isTradeHomeHubBottomNavActive(pathname)) return false;
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  return p === href.split("?")[0]?.trim();
}

/**
 * 하단 홈 **짧은 탭** — 거래 다이얼 열기/닫기 (페이지 이동 없음).
 * 거래 실홈(`/market`) 이동은 **롱프레스**만.
 */
export function runTradeHomeHubShortTap(args: TradeHomeHubShortTapArgs): boolean {
  if (args.longPressFired) return true;
  if (args.switcherOpen) {
    args.onCloseSwitcher();
  } else {
    args.onToggleSwitcher();
  }
  return true;
}

export function runTradeHomeHubLongPress(args: TradeHomeHubNavigateArgs): boolean {
  return runTradeHomeHubNavigateToMarket(args);
}
