import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { pathFromHref } from "@/lib/navigation/main-shell-push-session";
import { setMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { computeTradePrimaryPushAxis } from "@/lib/trade/tabs/compute-trade-primary-push-axis";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

export type CommitTradePrimaryTabRouteArgs = {
  href: string;
  fromTabIndex: number;
  toTabIndex: number;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  router: Pick<AppRouterInstance, "push" | "replace">;
  /** 정렬 칩 등 — 동일 pathname 에 쿼리만 바뀔 때 */
  useReplace?: boolean;
  /** pointerdown 에 이미 prewarm 한 경우 */
  skipPrewarm?: boolean;
};

export type CommitTradePrimaryTabRouteResult = "blocked" | "noop" | "navigated";

let tradePrimaryTabRouteCommitGeneration = 0;

/**
 * CONTRACT — 거래 1차 탭 **단일 이동 커밋**.
 * DO NOT: Link 기본 navigation 만으로 `beginMenuNavigation` — push 축·2rAF navigate 없음.
 * Hub keep-alive: `MainTabSurfaceKeepAlive` 가 `/market` Surface 유지 — temporary enter panel 금지.
 * 탭 하이라이트는 intent 즉시, 본문은 keep-alive visibility + cache-first MarketContent.
 */
export function commitTradePrimaryTabRoute(
  args: CommitTradePrimaryTabRouteArgs
): CommitTradePrimaryTabRouteResult {
  if (args.fromTabIndex === args.toTabIndex) return "noop";
  if (!args.guardBeforeNavigate(args.href)) return "blocked";

  const pushAxis = computeTradePrimaryPushAxis(args.fromTabIndex, args.toTabIndex);
  const targetPath = pathFromHref(args.href);
  setMainShellPushAxisIntent(pushAxis, targetPath);

  scrollAppShellToTop();

  args.beginMenuNavigation(args.href, "trade-primary", {
    mainShellPushAxis: pushAxis,
  });

  const generation = ++tradePrimaryTabRouteCommitGeneration;

  const navigate = () => {
    if (generation !== tradePrimaryTabRouteCommitGeneration) return;
    if (args.useReplace) {
      args.router.replace(args.href, { scroll: false });
    } else {
      args.router.push(args.href, { scroll: false });
    }
    if (!args.skipPrewarm) {
      try {
        prewarmBottomNavMarketTab(args.href);
      } catch {
        /* noop */
      }
    }
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(navigate);
    });
  } else {
    navigate();
  }

  return "navigated";
}
