import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import {
  isCrossMainShellRouteGroup,
  armMainShellPushEnterSession,
  pathFromHref,
} from "@/lib/navigation/main-shell-push-session";
import { setMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
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

/** 하단·다이얼 공통 — 이미 **동일 경로+쿼리**면 스크롤만. 하위 경로→허브 루트는 이동. */
export function shouldMainBottomNavRouteScrollOnly(
  pathname: string | null,
  currentSearchNoQuestion: string,
  targetHref: string
): boolean {
  const p = normalizeMainBottomNavRoutePath(pathname);
  const raw = targetHref.trim();
  const qIdx = raw.indexOf("?");
  const targetPath = normalizeMainBottomNavRoutePath(qIdx >= 0 ? raw.slice(0, qIdx) : raw);
  if (p !== targetPath) return false;
  if (!isBottomNavTabActive(pathname, targetHref)) return false;
  if (qIdx < 0) return true;
  const targetParams = new URLSearchParams(raw.slice(qIdx + 1));
  if ([...targetParams.keys()].length === 0) return true;
  const cur = new URLSearchParams(currentSearchNoQuestion);
  for (const key of targetParams.keys()) {
    if (cur.get(key) !== targetParams.get(key)) return false;
  }
  return true;
}

function normalizeMainBottomNavRoutePath(path: string | null | undefined): string {
  return (path ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

export type MainBottomNavRouteCommitArgs = {
  pathname: string | null;
  currentSearch: string;
  href: string;
  tabId: string;
  /** false면 prefetch·prewarm 생략(이미 활성 탭에서 쿼리만 바뀔 때 등) */
  prefetchWhenInactive?: boolean;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  onNavigationIntent: (tabId: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  push: (href: string) => void;
  replace: (href: string) => void;
  prefetch?: (href: string) => void;
  onPrewarm?: () => void;
  onCloseDomainSwitcher?: () => void;
  onCloseOverlay?: () => void;
  /** 확인 모달 단계에서 이미 prewarm을 수행한 경우 post-commit prewarm 생략 */
  skipPostCommitPrewarm?: boolean;
  /** chat·delivery-order-chat·다이얼 chat 등 */
  persistMessengerOriginFromHref?: boolean;
  /** perf 마커 — 다이얼은 overlay에서 click start 후 호출 가능 */
  skipPerfMark?: boolean;
};

export type MainBottomNavRouteCommitResult = "scroll_only" | "blocked" | "navigated";

/** 연속 탭 — 이전 async 커밋이 replace/push 하지 않도록 세대 카운터 */
let mainBottomNavRouteCommitGeneration = 0;

/**
 * CONTRACT — 하단 탭·배달 홈·다이얼 칩 **단일 이동 커밋**.
 * DO NOT: Link 기본 navigation·overlay 직접 push·tab.href 직접 push — 모두 여기 또는 resolver 경유.
 * DO NOT: `onNavigationIntent`·`beginMenuNavigation` 을 async(await) 뒤로 미루기 — push·orbit 즉시.
 * `(stores)`↔`(main)`: 즉시 navigate + session enter push; same-group: dual-panel + `mainShellPushAxis`.
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

  const pushAxis = computeMainBottomNavPushAxis(args.pathname, args.href);
  const targetPath = pathFromHref(args.href);
  setMainShellPushAxisIntent(pushAxis, targetPath);
  args.onNavigationIntent(args.tabId);
  args.beginMenuNavigation(args.href, "bottom-nav", {
    mainShellPushAxis: pushAxis,
  });

  void commitMainBottomNavRouteNavigateAsync(args, pushAxis);
  return "navigated";
}

async function commitMainBottomNavRouteNavigateAsync(
  args: MainBottomNavRouteCommitArgs,
  pushAxis: ReturnType<typeof computeMainBottomNavPushAxis>
): Promise<void> {
  const generation = ++mainBottomNavRouteCommitGeneration;

  const toPath = pathFromHref(args.href);
  const fromPath = (args.pathname ?? "").split("?")[0]?.trim() ?? "";

  if (pushAxis && isCrossMainShellRouteGroup(fromPath, toPath)) {
    armMainShellPushEnterSession(pushAxis, fromPath, toPath);
  }

  if (args.persistMessengerOriginFromHref) {
    try {
      const u = new URL(args.href, "https://samarket.local");
      const o = parseMessengerEntryOrigin(u.searchParams.get("from"));
      if (o) persistMessengerEntryOrigin(o);
    } catch {
      /* noop */
    }
  }

  if (generation !== mainBottomNavRouteCommitGeneration) {
    return;
  }

  const navClickT0 = performance.now();
  if (!args.skipPerfMark) {
    markBottomNavRouteIntentForBackgroundWarm();
    navPerfMarkBottomNavClickStart(navClickT0);
  }

  if (mainBottomNavRouteUsesReplace(args.pathname, args.href)) {
    args.replace(args.href);
  } else {
    args.push(args.href);
  }

  args.onCloseOverlay?.();

  const prewarmWhenInactive = args.prefetchWhenInactive !== false && args.skipPostCommitPrewarm !== true;
  if (prewarmWhenInactive) {
    const runPrewarm = () => {
      try {
        if (args.onPrewarm) args.onPrewarm();
        else prewarmBottomNavTapTargetClientCache(args.href);
      } catch {
        /* noop */
      }
    };
    if (typeof window === "undefined") {
      runPrewarm();
    } else {
      window.setTimeout(runPrewarm, 0);
    }
  }

  if (!args.skipPerfMark) {
    navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
  }
}
