import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { pathFromHref } from "@/lib/navigation/main-shell-push-session";
import { setMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import { computeTradePrimaryPushAxis } from "@/lib/trade/tabs/compute-trade-primary-push-axis";
import { isTradeMarketHubPathname } from "@/lib/trade/tabs/trade-market-feed-href";
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
  /** 현재 경로 — 허브 내 카테고리 전환이면 슬라이드·스크롤점프 생략 */
  fromPathname?: string | null;
};

export type CommitTradePrimaryTabRouteResult = "blocked" | "noop" | "navigated";

let tradePrimaryTabRouteCommitGeneration = 0;

function normalizeTradePrimaryTabHref(href: string): string {
  const raw = href.trim();
  const qi = raw.indexOf("?");
  const path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, "") || "/";
  const search = qi >= 0 ? raw.slice(qi + 1) : "";
  const sp = new URLSearchParams(search);
  const keys = [...new Set([...sp.keys()])].sort();
  const out = new URLSearchParams();
  for (const key of keys) {
    for (const value of sp.getAll(key)) out.append(key, value);
  }
  const qs = out.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Same-tab re-click is a noop only when the destination URL is already current. */
export function isTradePrimaryTabCommitNoop(args: {
  fromTabIndex: number;
  toTabIndex: number;
  href: string;
  currentHref?: string | null;
}): boolean {
  if (args.fromTabIndex !== args.toTabIndex) return false;
  const current = (args.currentHref ?? "").trim();
  if (!current) return true;
  return normalizeTradePrimaryTabHref(args.href) === normalizeTradePrimaryTabHref(current);
}

/**
 * CONTRACT — 거래 1차 탭 **단일 이동 커밋**.
 * 커뮤니티 topic 패리티: `/market` 허브 안에서는 `replace` + 축/스크롤점프 없음.
 * DO NOT: Link 기본 navigation 만으로 `beginMenuNavigation` — push 축·2rAF navigate 없음.
 * Hub Surface: route `/market` children only — temporary enter panel / KeepAlive multi-hub 금지.
 * 탭 하이라이트는 intent 즉시, 본문은 cache-first MarketContent.
 */
export function commitTradePrimaryTabRoute(
  args: CommitTradePrimaryTabRouteArgs
): CommitTradePrimaryTabRouteResult {
  if (
    isTradePrimaryTabCommitNoop({
      fromTabIndex: args.fromTabIndex,
      toTabIndex: args.toTabIndex,
      href: args.href,
      currentHref:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : args.fromPathname,
    })
  ) {
    return "noop";
  }
  if (!args.guardBeforeNavigate(args.href)) return "blocked";

  const targetPath = pathFromHref(args.href);
  const fromPath =
    args.fromPathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const sameMarketHub =
    isTradeMarketHubPathname(fromPath) && isTradeMarketHubPathname(targetPath);

  if (sameMarketHub) {
    args.beginMenuNavigation(args.href, "trade-primary", {
      mainShellPushAxis: null,
    });

    const generation = ++tradePrimaryTabRouteCommitGeneration;
    const navigate = () => {
      if (generation !== tradePrimaryTabRouteCommitGeneration) return;
      args.router.replace(args.href, { scroll: false });
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

  const pushAxis = computeTradePrimaryPushAxis(args.fromTabIndex, args.toTabIndex);
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
