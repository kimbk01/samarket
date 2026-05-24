import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import {
  parseMessengerEntryOrigin,
  persistMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import { isBottomNavTabActive } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";
import { markBottomNavRouteIntentForBackgroundWarm } from "@/lib/navigation/mark-bottom-nav-route-intent";
import {
  navPerfMarkBottomNavClickStart,
  navPerfSetOptimisticTotalMs,
} from "@/lib/navigation/nav-perf-browser";

/** `/market` 에서만 push — 그 외 탭 간 이동은 replace(히스토리 누적·뒤로가기 꼬임 완화) */
export function mainBottomNavRouteUsesReplace(pathname: string | null, targetHref: string): boolean {
  if (!pathname) return true;
  if (pathname === "/market" && targetHref !== "/market") return false;
  return true;
}

/**
 * 하단·다이얼 공통 — 이미 **동일 경로+쿼리**면 스크롤만.
 * `/mypage/section/...` 처럼 탭 루트 접두만 겹치면 false(탭 루트로 이동).
 */
export function shouldMainBottomNavRouteScrollOnly(
  pathname: string | null,
  currentSearchNoQuestion: string,
  targetHref: string
): boolean {
  if (!isBottomNavTabActive(pathname, targetHref)) return false;
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const raw = targetHref.trim();
  const qIdx = raw.indexOf("?");
  const targetPath = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).trim();
  if (p !== targetPath) return false;
  if (qIdx < 0) return true;
  const targetParams = new URLSearchParams(raw.slice(qIdx + 1));
  if ([...targetParams.keys()].length === 0) return true;
  const cur = new URLSearchParams(currentSearchNoQuestion);
  for (const key of targetParams.keys()) {
    if (cur.get(key) !== targetParams.get(key)) return false;
  }
  return true;
}

export type MainBottomNavRouteCommitArgs = {
  pathname: string | null;
  currentSearch: string;
  href: string;
  tabId: string;
  /** false면 prefetch·prewarm 생략(이미 활성 탭에서 쿼리만 바뀔 때 등) */
  prefetchWhenInactive?: boolean;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  push: (href: string) => void;
  replace: (href: string) => void;
  prefetch?: (href: string) => void;
  onPrewarm?: () => void;
  onCloseDomainSwitcher?: () => void;
  onCloseOverlay?: () => void;
  /** chat·delivery-order-chat·다이얼 chat 등 */
  persistMessengerOriginFromHref?: boolean;
  /** perf 마커 — 다이얼은 overlay에서 click start 후 호출 가능 */
  skipPerfMark?: boolean;
};

export type MainBottomNavRouteCommitResult = "scroll_only" | "blocked" | "navigated";

/**
 * CONTRACT — 하단 탭·배달 홈·다이얼 칩 **단일 이동 커밋**.
 * DO NOT: Link 기본 navigation·overlay 직접 push·tab.href 직접 push — 모두 여기 또는 resolver 경유.
 */
export function commitMainBottomNavRoute(args: MainBottomNavRouteCommitArgs): MainBottomNavRouteCommitResult {
  args.onCloseDomainSwitcher?.();

  if (shouldMainBottomNavRouteScrollOnly(args.pathname, args.currentSearch, args.href)) {
    scrollAppShellToTop();
    args.onCloseOverlay?.();
    return "scroll_only";
  }

  if (!args.guardBeforeNavigate(args.href)) {
    return "blocked";
  }

  const navClickT0 = performance.now();
  if (!args.skipPerfMark) {
    markBottomNavRouteIntentForBackgroundWarm();
    navPerfMarkBottomNavClickStart(navClickT0);
  }

  args.beginMenuNavigation(args.href);
  args.onNavigationIntent(args.tabId);

  if (args.persistMessengerOriginFromHref) {
    try {
      const u = new URL(args.href, "https://samarket.local");
      const o = parseMessengerEntryOrigin(u.searchParams.get("from"));
      if (o) persistMessengerEntryOrigin(o);
    } catch {
      /* noop */
    }
  }

  if (!args.skipPerfMark) {
    navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
  }

  const prefetchWhenInactive = args.prefetchWhenInactive !== false;
  if (prefetchWhenInactive) {
    try {
      args.prefetch?.(args.href);
    } catch {
      /* noop */
    }
    try {
      if (args.onPrewarm) args.onPrewarm();
      else prewarmBottomNavTapTargetClientCache(args.href);
    } catch {
      /* noop */
    }
  }

  if (mainBottomNavRouteUsesReplace(args.pathname, args.href)) {
    args.replace(args.href);
  } else {
    args.push(args.href);
  }

  args.onCloseOverlay?.();
  return "navigated";
}
