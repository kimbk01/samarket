import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import {
  resolveTradeSwipeTarget,
  type TradeSwipeDirection,
} from "@/lib/trade/swipe/resolve-trade-swipe-target";
import { commitTradePrimaryTabRoute } from "@/lib/trade/tabs/commit-trade-primary-tab-route";

export type CommitTradeSwipeTabRouteArgs = {
  tabs: Array<{ href: string }>;
  activeIndex: number;
  direction: TradeSwipeDirection;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  router: Pick<AppRouterInstance, "push" | "replace">;
};

/**
 * 거래 피드 스와이프 — 탭 배열 내부는 `commitTradePrimaryTabRoute`, 경계(하단 nav)는 `router.push`.
 */
export function commitTradeSwipeTabRoute(args: CommitTradeSwipeTabRouteArgs): boolean {
  const { tabs, activeIndex, direction } = args;
  const href = resolveTradeSwipeTarget(tabs, activeIndex, direction);
  if (!href) return false;

  const withinTabs =
    direction === "next"
      ? activeIndex >= 0 && activeIndex < tabs.length - 1
      : activeIndex > 0;

  if (withinTabs) {
    const toIdx = direction === "next" ? activeIndex + 1 : activeIndex - 1;
    const target = tabs[toIdx];
    if (!target) return false;
    return (
      commitTradePrimaryTabRoute({
        href: target.href,
        fromTabIndex: activeIndex,
        toTabIndex: toIdx,
        beginMenuNavigation: args.beginMenuNavigation,
        guardBeforeNavigate: args.guardBeforeNavigate,
        router: args.router,
      }) !== "blocked"
    );
  }

  if (!args.guardBeforeNavigate(href)) return false;
  void args.router.push(href, { scroll: false });
  return true;
}
