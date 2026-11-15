import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import { pathFromHref } from "@/lib/navigation/main-shell-push-session";
import { setMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import { markAppScrollNavIntent } from "@/lib/navigation/app-scroll-memory";
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
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";
import {
  beginBottomNavShowing,
  failBottomNavShowing,
  parseBottomNavTarget,
} from "@/lib/main-menu/bottom-nav-controller";
import { clearPendingMenuNavigationBridge } from "@/lib/navigation/pending-menu-navigation-bridge";

/**
 * BottomNav MAIN DOMAIN history SSOT.
 * Back contract (`cm-hub-navigation-contract`): hub tabs = same-layer **replace**;
 * room/call = stack **push**. DO NOT push hub↔hub (history tangle / Back ≠ hub).
 */
export const BOTTOM_NAV_HISTORY_MODE = "replace" as const;

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
  ) => { id: number } | void;
  onNavigationIntent: (tabId: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  /** @deprecated 허브 탭 이력은 replace 만(`BOTTOM_NAV_HISTORY_MODE`). 호출처 호환용으로만 받는다 */
  push?: (href: string) => void;
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
  /**
   * 이동이 실제로 나가지 못했을 때(`guardedClientNavigate` 거부) 알림. 하단 탭 선택 표시는 컨트롤러가 되돌린다.
   */
  onNavigationBlocked?: () => void;
  /**
   * 메인 하단 탭(BottomNav)만 true — 하단 탭 컨트롤러(`bottom-nav-controller`)로 선택 표시·화면 교체를 시작한다
   * (계약 v2 · Owner 2026-11-15). 배달 다이얼 등 다른 진입은 false.
   */
  showOnBottomNavController?: boolean;
  /**
   * 누른 뒤 기다림(await)을 거쳐 나중에 실행되는 커밋 — 예: 채팅 탭 로그인 확인 뒤. 그 사이 방·통화 진입이 시작됐으면
   * 잠금이 이긴다(`bottom_nav_async`). 손 뗀 그 자리에서 바로 나가는 커밋(기본)은 `bottom_nav_explicit` — 사용자 탭이 잠금을 푼다.
   */
  deferredAfterAwait?: boolean;
};

export type MainBottomNavRouteCommitResult = "scroll_only" | "blocked" | "navigated";

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
  setMainShellPushAxisIntent(pushAxis, targetPath);

  /** 스크롤 SSOT (2026-11-03): 같은 탭 하위 화면에서 누름 = 그 탭 최상위 맨 위(P3) · 다른 탭으로 = 그 탭 마지막 위치 복원(P2) */
  markAppScrollNavIntent(isBottomNavTabActive(commitArgs.pathname, commitArgs.href) ? "tab-reselect" : "tab-switch");
  /**
   * 하단 탭 컨트롤러 — 손 뗀 순간 선택 표시·화면 교체 시작. 같은 경로(쿼리만 다름: 커뮤니티 복원 등)는 화면 교체가 없으므로
   * 시작하지 않는다(경로가 바뀌지 않아 확정 신호가 오지 않음).
   */
  const controllerId =
    commitArgs.showOnBottomNavController && parseBottomNavTarget(commitArgs.href).path !== fromPath
      ? beginBottomNavShowing({ tabId: commitArgs.tabId, href: commitArgs.href })
      : null;
  commitArgs.onNavigationIntent(commitArgs.tabId);
  const intent = commitArgs.beginMenuNavigation(commitArgs.href, "bottom-nav", {
    mainShellPushAxis: pushAxis,
  });

  const sent = commitMainBottomNavRouteNavigateSync(commitArgs);
  if (!sent) {
    /** 거부 — 컨트롤러·메뉴 의도를 같은 기준으로 함께 되돌린다(기다림 상태 하나) */
    if (controllerId != null) failBottomNavShowing(controllerId);
    clearPendingMenuNavigationBridge(intent ? intent.id : undefined);
    commitArgs.onNavigationBlocked?.();
    return "blocked";
  }
  return "navigated";
}

function commitMainBottomNavRouteNavigateSync(args: MainBottomNavRouteCommitArgs): boolean {
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
  /**
   * 사용자가 손 뗀 자리에서 바로 나가는 하단 탭 = `bottom_nav_explicit` — 방·통화 진입 잠금을 풀고 통과한다
   * (`cm-deep-route-navigation-lock` 계약). 예전에는 잠금 중 `bottom_nav_async` 로 바꿔 보내 사용자 탭이 조용히 거부됐다
   * (Samsung 실측 2026-11-15 12:08 `blocked_navigation`). 허브 탭 이력 = replace(`BOTTOM_NAV_HISTORY_MODE`).
   */
  const sent = guardedClientNavigate(
    args.replace,
    args.href,
    args.deferredAfterAwait ? "bottom_nav_async" : "bottom_nav_explicit",
    { fromHref }
  );
  if (!sent) return false;

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
  return true;
}
