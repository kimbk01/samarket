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
import {
  abortStoresBrowseAmbientPrewarm,
  isStoresBrowseHubPath,
  isStoresSurfacePath,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";
import { markBottomNavRouteIntentForBackgroundWarm } from "@/lib/navigation/mark-bottom-nav-route-intent";
import {
  navPerfMarkBottomNavClickStart,
  navPerfSetOptimisticTotalMs,
} from "@/lib/navigation/nav-perf-browser";
import { guardedClientNavigate } from "@/lib/navigation/guarded-client-navigation";
import { isDeepRouteNavigationLockActive } from "@/lib/navigation/cm-deep-route-navigation-lock";
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";

/**
 * BottomNav MAIN DOMAIN history SSOT.
 * Back contract (`cm-kakao-telegram-navigation-contract`): hub tabs = same-layer **replace**;
 * room/call = stack **push**. DO NOT push hub↔hub (history tangle / Back ≠ hub).
 */
export const BOTTOM_NAV_HISTORY_MODE = "replace" as const;

/** @deprecated use BOTTOM_NAV_HISTORY_MODE — always replace for hub tabs */
export function mainBottomNavRouteUsesReplace(
  _pathname: string | null,
  _targetHref: string
): boolean {
  return true;
}

/** 하단·다이얼 공통 — 이미 **동일 경로+쿼리**면 스크롤만. 하위 경로→허브 루트는 이동.
 * Slice 2 Authority: `/mypage` 더블탭 My → scroll_only (`isMypageDomainHubPath` + 본 함수).
 */
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

/**
 * 카톡/텔레그램형 — 하단 탭은 **허브 간 동기 replace/push** 만.
 * 방·통화(deep route)는 room_forward/call_launch 가 stack 을 소유; async tab replace 금지.
 */
export function abortPendingMainBottomNavRouteCommits(): void {
  /* sync hub commit — stale async navigation 없음. room/call 진입 훅 호환용 no-op */
}

/**
 * CONTRACT — 하단 탭·배달 홈·다이얼 칩 **단일 이동 커밋**.
 * DO NOT: Link 기본 navigation·overlay 직접 push·tab.href 직접 push — 모두 여기 또는 resolver 경유.
 * DO NOT: `onNavigationIntent`·`beginMenuNavigation` 을 async(await) 뒤로 미루기 — push·orbit 즉시.
 * DO NOT: router replace/push 를 microtask·setTimeout 으로 미루기 — deep route 진입과 레이스.
 * same-group: `pendingMenuIntent` + route sync; hub Surfaces = route children only (no Instant enter panel).
 */
export function commitMainBottomNavRoute(args: MainBottomNavRouteCommitArgs): MainBottomNavRouteCommitResult {
  args.onCloseDomainSwitcher?.();

  /** Community hub: restore last topic/local/sort on entry (no bare /philife → All flash). */
  const href = resolveCommunityBottomNavEntryHref(args.href, { fromPathname: args.pathname });
  const commitArgs = href === args.href ? args : { ...args, href };

  if (shouldMainBottomNavRouteScrollOnly(commitArgs.pathname, commitArgs.currentSearch, commitArgs.href)) {
    scrollAppShellToTop();
    commitArgs.onCloseOverlay?.();
    return "scroll_only";
  }

  if (!commitArgs.guardBeforeNavigate(commitArgs.href)) {
    return "blocked";
  }

  const pushAxis = computeMainBottomNavPushAxis(commitArgs.pathname, commitArgs.href);
  const targetPath = pathFromHref(commitArgs.href);
  const fromPath = normalizeMainBottomNavRoutePath(commitArgs.pathname);
  const normalizedTargetPath = normalizeMainBottomNavRoutePath(targetPath);
  if (isStoresBrowseHubPath(fromPath) && !isStoresSurfacePath(normalizedTargetPath)) {
    abortStoresBrowseAmbientPrewarm("bottom_nav_route_commit");
  }
  const crossGroup = Boolean(pushAxis && isCrossMainShellRouteGroup(fromPath, targetPath));
  setMainShellPushAxisIntent(pushAxis, targetPath);

  if (crossGroup) {
    armMainShellPushEnterSession(pushAxis!, fromPath, targetPath);
  }

  commitArgs.onNavigationIntent(commitArgs.tabId);
  commitArgs.beginMenuNavigation(commitArgs.href, "bottom-nav", {
    mainShellPushAxis: pushAxis,
    ...(crossGroup ? { mainShellCrossGroupPush: true } : {}),
  });

  commitMainBottomNavRouteNavigateSync(commitArgs);
  return "navigated";
}

function commitMainBottomNavRouteNavigateSync(args: MainBottomNavRouteCommitArgs): void {
  if (args.persistMessengerOriginFromHref) {
    try {
      const u = new URL(args.href, "https://samarket.local");
      const o = parseMessengerEntryOrigin(u.searchParams.get("from"));
      if (o) persistMessengerEntryOrigin(o);
    } catch {
      /* noop */
    }
  }

  const navClickT0 = performance.now();
  if (!args.skipPerfMark) {
    markBottomNavRouteIntentForBackgroundWarm();
    navPerfMarkBottomNavClickStart(navClickT0);
  }

  const fromHref =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null;
  /** APK — 탭 commit 직전 RSC warmup (웹은 prefetch 미전달) */
  if (args.prefetch) {
    try {
      args.prefetch(args.href);
    } catch {
      /* noop */
    }
  }
  /** deep route 진입 창 — hub 탭이 lock 을 bottom_nav_explicit 로 덮지 않게 */
  const navSource = isDeepRouteNavigationLockActive() ? "bottom_nav_async" : "bottom_nav_explicit";
  if (mainBottomNavRouteUsesReplace(args.pathname, args.href)) {
    guardedClientNavigate(args.replace, args.href, navSource, { fromHref });
  } else {
    guardedClientNavigate(args.push, args.href, navSource, { fromHref });
  }

  args.onCloseOverlay?.();

  const prewarmWhenInactive = args.prefetchWhenInactive !== false && args.skipPostCommitPrewarm !== true;
  if (prewarmWhenInactive) {
    const runPrewarm = () => {
      try {
        if (args.onPrewarm) args.onPrewarm();
        else prewarmBottomNavTapTargetClientCache(args.href, { source: "route_commit" });
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
