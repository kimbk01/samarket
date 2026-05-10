"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOTTOM_NAV_BADGE_RING_CLASS,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_THEME,
  type BottomNavIconKey,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  useOwnerHubBadgeStoreDeepLink,
  useOwnerHubBadgeTabUnreadCount,
} from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import {
  useOwnerLiteHasPreferredStore,
  useOwnerLitePreferredStoreRow,
} from "@/lib/stores/use-owner-lite-store";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { cancelScheduledWhenBrowserIdle, isConstrainedNetwork, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import {
  BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS,
  BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS,
  BOTTOM_NAV_PREFETCH_SPREAD_MS,
} from "@/lib/performance/chrome-navigation-policy";
import {
  shouldEnableNextLinkPrefetchOnMainNav,
  shouldRunBottomNavProgrammaticPrefetch,
} from "@/lib/runtime/next-js-dev-client";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";
import { prewarmBottomNavTapHrefResolvingStoresRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import { isCommunityMessengerRoomPathname } from "@/lib/layout/conditional-app-shell-flags";
import { bumpMessengerRenderPerf, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import {
  isBottomNavTabActive,
  pickMainBottomNavPrefetchHrefs,
  resolveBottomNavTabProgrammaticPrefetchHref,
} from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { bottomNavMessengerHrefWithOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import {
  navPerfMarkBottomNavClickStart,
  navPerfSetOptimisticTotalMs,
} from "@/lib/navigation/nav-perf-browser";
import { useRegion } from "@/contexts/RegionContext";

/** `/market` 에서만 push — 그 외 탭 간 이동은 replace(히스토리 누적·뒤로가기 꼬임 완화) */
function mainTabLinkUsesReplace(pathname: string | null, targetHref: string): boolean {
  if (!pathname) return true;
  if (pathname === "/market" && targetHref !== "/market") return false;
  return true;
}

/**
 * 하단 탭 재탭 시 `preventDefault` 로 스크롤만 할지.
 * - 경로가 링크와 **정확히 같을 때만** 쿼리까지 비교한다 (`/community-messenger` + section=friends → chats 링크는 네비게이션).
 * - `/mypage/section/...` 처럼 탭 루트의 **접두 경로**에만 있을 때는 링크가 루트로 이동하도록 `false`.
 */
function shouldBottomNavTapScrollOnlyNoNavigate(
  pathname: string | null,
  currentSearchNoQuestion: string,
  tabHref: string
): boolean {
  if (!isBottomNavTabActive(pathname, tabHref)) return false;
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const raw = tabHref.trim();
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

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

/** 데스크톱 포인터는 사용자 제스처로 간주되지 않아 vibrate 가 막히며 콘솔 Intervention 이 난다 — 터치만. */
function triggerLightTapFeedback(ev?: { pointerType?: string }): void {
  try {
    if (ev && ev.pointerType !== "touch") return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    /* noop */
  }
}

declare global {
  interface Window {
    __samarketLastBottomNavRouteIntentAt?: number;
  }
}

function markBottomNavRouteIntentForBackgroundWarm(): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  window.__samarketLastBottomNavRouteIntentAt = performance.now();
}

const BOTTOM_NAV_BACKGROUND_PREFETCH_QUIET_MS = 2_500;

function remainingBottomNavBackgroundPrefetchQuietMs(): number {
  if (typeof window === "undefined" || typeof performance === "undefined") return 0;
  const last = window.__samarketLastBottomNavRouteIntentAt;
  if (typeof last !== "number" || !Number.isFinite(last)) return 0;
  return Math.max(0, BOTTOM_NAV_BACKGROUND_PREFETCH_QUIET_MS - (performance.now() - last));
}

const BottomNavHubBadgeDot = memo(function BottomNavHubBadgeDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={`bottom-nav-hub-badge ${OWNER_HUB_BADGE_DOT_CLASS} ${BOTTOM_NAV_BADGE_RING_CLASS}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
});

function onBottomNavTabActivate(
  pathname: string | null,
  currentSearchNoQuestion: string,
  tabHref: string,
  e: MouseEvent<HTMLAnchorElement>
): void {
  if (!shouldBottomNavTapScrollOnlyNoNavigate(pathname, currentSearchNoQuestion, tabHref)) return;
  e.preventDefault();
  scrollAppShellToTop();
}

const BottomNavTabStandard = memo(function BottomNavTabStandard({
  tab,
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  navSearch: string;
  /** 탭 이동 직후 — pathname 갱신 전에도 **한 탭만** 활성으로 보이게 함(이전 경로 탭이 남는 체감 제거) */
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const { tt, t } = useI18n();
  const router = useRouter();
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isBottomNavTabActive(pathname, tab.href);
  const Icon = TAB_ICONS[tab.icon];
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  /** 메신저 탭: 현재 표면(커뮤니티·거래·배달)에 맞춰 `?from=` 부착 — 상단 헤더 진입과 동일 출처 규칙 */
  const effectiveHref = useMemo(
    () => (tab.id === "chat" ? bottomNavMessengerHrefWithOrigin(tab.href, pathname) : tab.href),
    [tab.id, tab.href, pathname]
  );

  const className = [
    "app-bottom-nav-item group",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    hasOwnerStore && !isActive ? "opacity-95" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), count: tabBadgeCount })
      : undefined;

  const inner = (
    <>
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={isActive ? "on" : "off"}>
          <Icon className={iconSize} />
          <BottomNavHubBadgeDot count={tabBadgeCount} />
        </span>
      </div>
      <span className={`app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`} suppressHydrationWarning>
        {tab.labelKey ? t(tab.labelKey) : tt(tab.label)}
      </span>
    </>
  );

  return (
    <Link
      href={effectiveHref}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav()}
      replace={mainTabLinkUsesReplace(pathname ?? null, effectiveHref)}
      scroll={false}
      className={className}
      data-active={isActive ? "true" : "false"}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => {
        if (!isActive) {
          try {
            void router.prefetch(effectiveHref);
          } catch {
            /* noop */
          }
          try {
            prewarmBottomNavTapTargetClientCache(effectiveHref);
          } catch {
            /* noop */
          }
        }
      }}
      onFocus={() => {
        if (!isActive) {
          try {
            void router.prefetch(effectiveHref);
          } catch {
            /* noop */
          }
          try {
            prewarmBottomNavTapTargetClientCache(effectiveHref);
          } catch {
            /* noop */
          }
        }
      }}
      onTouchStart={() => {
        if (!isActive) {
          try {
            void router.prefetch(effectiveHref);
          } catch {
            /* noop */
          }
          try {
            prewarmBottomNavTapTargetClientCache(effectiveHref);
          } catch {
            /* noop */
          }
        }
      }}
      onPointerDown={(e) => {
        triggerLightTapFeedback(e);
        /** `beginMenuNavigation` 은 click 한 번만 — pointerDown+click 이중 호출 방지 */
        if (!isActive) {
          markBottomNavRouteIntentForBackgroundWarm();
          try {
            void router.prefetch(effectiveHref);
          } catch {
            /* noop */
          }
          /** RSC 프리페치와 별도로 클라 데이터 캐시도 함께 데워 첫 진입 즉시 렌더 */
          try {
            prewarmBottomNavTapTargetClientCache(effectiveHref);
          } catch {
            /* noop */
          }
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          if (
            !shouldBottomNavTapScrollOnlyNoNavigate(pathname, navSearch, effectiveHref) &&
            !guardBeforeNavigate(effectiveHref)
          ) {
            e.preventDefault();
            return;
          }
          const navClickT0 = performance.now();
          markBottomNavRouteIntentForBackgroundWarm();
          navPerfMarkBottomNavClickStart(navClickT0);
          beginMenuNavigation(effectiveHref);
          onNavigationIntent(tab.id);
          navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
          if (!isActive) {
            try {
              void router.prefetch(effectiveHref);
            } catch {
              /* noop */
            }
            try {
              prewarmBottomNavTapTargetClientCache(effectiveHref);
            } catch {
              /* noop */
            }
          }
        }
      }}
      onClick={(e) => {
        if (shouldBottomNavTapScrollOnlyNoNavigate(pathname, navSearch, effectiveHref)) {
          onBottomNavTabActivate(pathname, navSearch, effectiveHref, e);
          return;
        }
        if (!guardBeforeNavigate(effectiveHref)) {
          e.preventDefault();
          return;
        }
        const navClickT0 = performance.now();
        markBottomNavRouteIntentForBackgroundWarm();
        navPerfMarkBottomNavClickStart(navClickT0);
        beginMenuNavigation(effectiveHref);
        onNavigationIntent(tab.id);
        navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
        onBottomNavTabActivate(pathname, navSearch, effectiveHref, e);
      }}
    >
      {inner}
    </Link>
  );
});

const BottomNavTabStores = memo(function BottomNavTabStores({
  tab,
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const { tt, t } = useI18n();
  const router = useRouter();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const { primaryRegion } = useRegion();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount("stores");
  const _storeDeepLink = useOwnerHubBadgeStoreDeepLink();
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isBottomNavTabActive(pathname, tab.href);
  const Icon = TAB_ICONS.stores;
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const storesTabOwnerLite = !!ownerStore;
  const prewarmStoresTabClientCache = useCallback(() => {
    prewarmBottomNavTapHrefResolvingStoresRegion(tab.href, primaryRegion);
  }, [primaryRegion, tab.href]);

  const inactiveSurface =
    isActive || !storesTabOwnerLite
      ? ""
      : "bg-transparent";
  const className = [
    "app-bottom-nav-item group",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    inactiveSurface,
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), count: tabBadgeCount })
      : storesTabOwnerLite && ownerStore?.store_name
        ? t("nav_store_owner", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), storeName: ownerStore.store_name })
        : undefined;

  const inner = (
    <>
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={isActive ? "on" : "off"}>
          <Icon className={iconSize} />
          <BottomNavHubBadgeDot count={tabBadgeCount} />
        </span>
      </div>
      <span className={`app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`} suppressHydrationWarning>
        {tab.labelKey ? t(tab.labelKey) : tt(tab.label)}
      </span>
    </>
  );

  return (
    <Link
      href={tab.href}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav()}
      replace={mainTabLinkUsesReplace(pathname ?? null, tab.href)}
      scroll={false}
      className={className}
      data-active={isActive ? "true" : "false"}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => {
        if (!isActive) {
          try {
            void router.prefetch(tab.href);
          } catch {
            /* noop */
          }
          try {
            prewarmStoresTabClientCache();
          } catch {
            /* noop */
          }
        }
      }}
      onFocus={() => {
        if (!isActive) {
          try {
            void router.prefetch(tab.href);
          } catch {
            /* noop */
          }
          try {
            prewarmStoresTabClientCache();
          } catch {
            /* noop */
          }
        }
      }}
      onTouchStart={() => {
        if (!isActive) {
          try {
            void router.prefetch(tab.href);
          } catch {
            /* noop */
          }
          try {
            prewarmStoresTabClientCache();
          } catch {
            /* noop */
          }
        }
      }}
      onPointerDown={(e) => {
        triggerLightTapFeedback(e);
        if (!isActive) {
          markBottomNavRouteIntentForBackgroundWarm();
          try {
            void router.prefetch(tab.href);
          } catch {
            /* noop */
          }
          try {
            prewarmStoresTabClientCache();
          } catch {
            /* noop */
          }
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          if (
            !shouldBottomNavTapScrollOnlyNoNavigate(pathname, navSearch, tab.href) &&
            !guardBeforeNavigate(tab.href)
          ) {
            e.preventDefault();
            return;
          }
          const navClickT0 = performance.now();
          markBottomNavRouteIntentForBackgroundWarm();
          navPerfMarkBottomNavClickStart(navClickT0);
          beginMenuNavigation(tab.href);
          onNavigationIntent(tab.id);
          navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
          if (!isActive) {
            try {
              void router.prefetch(tab.href);
            } catch {
              /* noop */
            }
            try {
              prewarmStoresTabClientCache();
            } catch {
              /* noop */
            }
          }
        }
      }}
      onClick={(e) => {
        if (shouldBottomNavTapScrollOnlyNoNavigate(pathname, navSearch, tab.href)) {
          onBottomNavTabActivate(pathname, navSearch, tab.href, e);
          return;
        }
        if (!guardBeforeNavigate(tab.href)) {
          e.preventDefault();
          return;
        }
        const navClickT0 = performance.now();
        markBottomNavRouteIntentForBackgroundWarm();
        navPerfMarkBottomNavClickStart(navClickT0);
        beginMenuNavigation(tab.href);
        onNavigationIntent(tab.id);
        navPerfSetOptimisticTotalMs(performance.now() - navClickT0);
        onBottomNavTabActivate(pathname, navSearch, tab.href, e);
      }}
    >
      {inner}
    </Link>
  );
});

const TAB_ICONS: Record<BottomNavIconKey, (props: { className?: string }) => React.ReactNode> = {
  home: HomeIcon,
  trade: TradeTabIcon,
  community: CommunityIcon,
  stores: StoreTabIcon,
  orders: OrdersTabIcon,
  chat: ChatIcon,
  my: MyIcon,
};

/** 필라이프(포털) · 거래·스토어 하단 탭 `translate` 전환 */
const BOTTOM_NAV_OUTER_MOTION =
  "transition-transform duration-150 will-change-transform [transition-timing-function:cubic-bezier(0.25,0.1,0.2,1)]";
const BOTTOM_NAV_BOOT_WARM_SESSION_KEY = "samarket:bottom-nav:boot-warm:v1";

export function BottomNav({
  initialTabs = null,
  bodyPortal = false,
  extraOuterClassName = "",
}: {
  /**
   * SSR hydrate 호환을 위해 시그니처 유지 — 실제 탭 단일 소스는
   * `MainBottomNavTabsProvider` 가 `(main)/layout.tsx` 의 동일한 server payload 로 mount 된다.
   */
  initialTabs?: BottomNavItemConfig[] | null;
  /** `transform` 이 걸린 조상 밖(뷰포트 `fixed`) — 필라이프 헤더 메신저 슬라이드 스택 */
  bodyPortal?: boolean;
  extraOuterClassName?: string;
}) {
  void initialTabs;
  bumpMessengerRenderPerf("messenger_bottom_nav_render");
  const pathname = usePathname();
  /** idle 프리페치 콜백 시점의 최신 경로 — effect deps 는 도메인 키만 쓰므로 클로저 pathname 고착 방지 */
  const pathnameForPrefetchRef = useRef<string | null>(pathname ?? null);
  useLayoutEffect(() => {
    pathnameForPrefetchRef.current = pathname ?? null;
  }, [pathname]);
  const bottomNavPrefetchDomain = useMemo(
    () => mainBottomNavPrefetchTriggerKey(pathname ?? null),
    [pathname]
  );
  const { primaryRegion } = useRegion();
  const primaryRegionRef = useRef(primaryRegion);
  useLayoutEffect(() => {
    primaryRegionRef.current = primaryRegion;
  }, [primaryRegion]);
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();
  const router = useRouter();
  const { beginMenuNavigation } = useLatestMenuNavigation();
  /** `useRouter()` 는 AppRouterContext 갱신 시마다 항상 동일 식별자가 아닐 수 있음 — prefetch effect deps 는 도메인 키만. */
  const routerRef = useRef(router);
  useLayoutEffect(() => {
    routerRef.current = router;
  }, [router]);
  /**
   * 탭 단일 소스: `MainBottomNavTabsProvider`. admin 변경·storage 동기화·관리자 이탈 강제 재조회는
   * 해당 Provider 가 담당하므로 여기서는 읽기만. (`initialTabs` prop 은 SSR hydrate 호환을 위해 시그니처 유지.)
   */
  const tabs = useMainBottomNavTabs();
  const [pendingActiveTabId, setPendingActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  /** 브라우저 `window.setTimeout` id — `@types/node` 의 `ReturnType<typeof setTimeout>` 과 분리 */
  const pendingActiveResetTimerRef = useRef<number | null>(null);
  const lastPathnameForPendingRef = useRef<string | null>(pathname ?? null);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const isChatRoomDetail =
    (pathname?.match(/^\/community-messenger\/rooms\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/chats\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/mypage\/trade\/chat\/[^/]+\/?$/) ?? false);

  const clearPendingActiveReset = useCallback(() => {
    if (pendingActiveResetTimerRef.current != null) {
      window.clearTimeout(pendingActiveResetTimerRef.current);
      pendingActiveResetTimerRef.current = null;
    }
  }, []);

  const markBottomNavIntent = useCallback(
    (tabId: string) => {
      setPendingActiveTabId((prev) => (prev === tabId ? prev : tabId));
      clearPendingActiveReset();
      pendingActiveResetTimerRef.current = window.setTimeout(() => {
        pendingActiveResetTimerRef.current = null;
        setPendingActiveTabId(null);
      }, 1500);
    },
    [clearPendingActiveReset]
  );
  /** 탭 클릭 인텐트 — 본문 슬라이드는 `route-transition-config` pathname 단일 소스 (`mainShellTabSlide` 미사용) */
  const beginBottomNavNavigation = useCallback(
    (href: string) => {
      beginMenuNavigation(href, "bottom-nav");
    },
    [beginMenuNavigation]
  );

  useEffect(() => {
    const prev = lastPathnameForPendingRef.current;
    const next = pathname ?? null;
    lastPathnameForPendingRef.current = next;
    if (prev === next || pendingActiveTabId == null) return;
    clearPendingActiveReset();
    setPendingActiveTabId(null);
  }, [pathname, pendingActiveTabId, clearPendingActiveReset]);

  useEffect(() => {
    return () => {
      clearPendingActiveReset();
    };
  }, [clearPendingActiveReset]);

  /**
   * 주요 탭 RSC idle 선로딩 — **비활성 탭 최대 4개(`pickMainBottomNavPrefetchHrefs`)**, 순차 `router.prefetch`.
   *
   * **회귀 방지(중복·누락)**:
   * - effect deps 는 `mainBottomNavPrefetchTriggerKey` 만 — 같은 셸 도메인 안 세부 경로 변경으로 배치가 다시 돌지 않게 한다.
   * - `pick` 에는 `pathnameForPrefetchRef.current` 로 **idle 실행 시점** 최신 pathname 을 넘긴다.
   * - `pickMainBottomNavPrefetchHrefs` 내부 `seen` + 상한으로 href 중복·초과 방지.
   *
   * 경로가 바뀌면 **연쇄 setTimeout 전부 취소**한다. `NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH=1` 로 끔.
   */
  useEffect(() => {
    if (!shouldRunBottomNavProgrammaticPrefetch()) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    let cancelled = false;
    let idleId = -1;
    const chainTimers: number[] = [];

    const debounceId = window.setTimeout(() => {
      if (cancelled) return;
      idleId = scheduleWhenBrowserIdle(() => {
        if (cancelled) return;
        const hrefs = pickMainBottomNavPrefetchHrefs(pathnameForPrefetchRef.current, tabsRef.current);
        if (hrefs.length === 0) return;

        const scheduleNext = (nextIdx: number) => {
          if (nextIdx >= hrefs.length) return;
          const quietMs = remainingBottomNavBackgroundPrefetchQuietMs();
          chainTimers.push(
            window.setTimeout(() => runPrefetchAt(nextIdx), Math.max(BOTTOM_NAV_PREFETCH_SPREAD_MS, quietMs))
          );
        };

        const runPrefetchAt = (idx: number) => {
          if (cancelled || idx >= hrefs.length) return;
          const quietMs = remainingBottomNavBackgroundPrefetchQuietMs();
          if (quietMs > 0) {
            chainTimers.push(
              window.setTimeout(() => runPrefetchAt(idx), quietMs + BOTTOM_NAV_PREFETCH_SPREAD_MS)
            );
            return;
          }
          const href = hrefs[idx];
          try {
            samarketRuntimeDebugLog("bottom-nav-prefetch", "router.prefetch", {
              href,
              pathname: pathnameForPrefetchRef.current,
              prefetchDomain: bottomNavPrefetchDomain,
              index: idx,
              total: hrefs.length,
            });
            routerRef.current.prefetch(href);
            const pathOnly = (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
            if (pathOnly === "/community-messenger") {
              warmMessengerListBootstrapClient();
            }
            /** idle 프리페치 사이클에서도 클라 데이터 캐시를 함께 데워 RSC·DATA 캐시 분리 미스 방지 */
            try {
              prewarmBottomNavTapHrefResolvingStoresRegion(href, primaryRegionRef.current);
            } catch {
              /* noop */
            }
          } catch {
            /* no-op */
          }
          scheduleNext(idx + 1);
        };
        runPrefetchAt(0);
      }, BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS);
    }, BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
      cancelScheduledWhenBrowserIdle(idleId);
      for (const tid of chainTimers) {
        window.clearTimeout(tid);
      }
      chainTimers.length = 0;
    };
  }, [bottomNavPrefetchDomain]);

  /**
   * 첫 탭 진입 콜드 스타트 완화:
   * - 앱 세션당 1회, 하단 탭 `prefetch` + 클라 데이터 prewarm
   * - **동시에 5탭을 한 프레임에서 몰아치면** 메인 스레드·`/api/trade/feed` 등이 겹쳐 탭 반응·거래 목록이 버벅인다.
   *   아래 idle 프리페치 effect 와 같이 `idle 지연` + `BOTTOM_NAV_PREFETCH_SPREAD_MS` 간격으로 순차 실행한다.
   */
  useEffect(() => {
    if (!shouldRunBottomNavProgrammaticPrefetch()) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(BOTTOM_NAV_BOOT_WARM_SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(BOTTOM_NAV_BOOT_WARM_SESSION_KEY, "1");
    } catch {
      /* ignore storage failures */
    }
    const at = pathnameForPrefetchRef.current;
    const hrefs = tabsRef.current
      .map((tab) => resolveBottomNavTabProgrammaticPrefetchHref(tab, at))
      .filter((href, idx, arr) => arr.indexOf(href) === idx)
      .slice(0, 5);
    if (hrefs.length === 0) return;

    let cancelled = false;
    const chainTimers: number[] = [];
    const idleId = scheduleWhenBrowserIdle(() => {
      if (cancelled) return;
      hrefs.forEach((href, idx) => {
        chainTimers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            const quietMs = remainingBottomNavBackgroundPrefetchQuietMs();
            if (quietMs > 0) {
              chainTimers.push(
                window.setTimeout(() => {
                  if (cancelled) return;
                  try {
                    routerRef.current.prefetch(href);
                    prewarmBottomNavTapHrefResolvingStoresRegion(href, primaryRegionRef.current);
                  } catch {
                    /* noop */
                  }
                }, quietMs + BOTTOM_NAV_PREFETCH_SPREAD_MS)
              );
              return;
            }
            try {
              routerRef.current.prefetch(href);
              prewarmBottomNavTapHrefResolvingStoresRegion(href, primaryRegionRef.current);
            } catch {
              /* noop */
            }
          }, idx * BOTTOM_NAV_PREFETCH_SPREAD_MS)
        );
      });
    }, BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS);

    return () => {
      cancelled = true;
      cancelScheduledWhenBrowserIdle(idleId);
      for (const tid of chainTimers) {
        window.clearTimeout(tid);
      }
      chainTimers.length = 0;
    };
  }, []);

  const [portalToBody, setPortalToBody] = useState(false);
  useLayoutEffect(() => {
    if (bodyPortal) setPortalToBody(true);
  }, [bodyPortal]);

  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();

  const hideBottomNavShell =
    (isChatRoomDetail && !isCommunityMessengerRoomPathname(pathname ?? null)) ||
    // Owner business hub surfaces manage their own navigation/actions.
    // Keep the global bottom nav hidden to avoid duplicated controls.
    // Canonical owner surface is `/stores/owner/*`; legacy `/mypage/business`·`/my/business`
    // 는 라우트 레벨에서 새 경로로 리다이렉트되지만 분기 안전망으로 함께 둔다.
    (pathname?.startsWith("/stores/owner") ?? false) ||
    (pathname?.startsWith("/mypage/business") ?? false) ||
    (pathname?.startsWith("/my/business") ?? false);

  const outerClass = [
    BOTTOM_NAV_SHELL.outerClassName,
    bodyPortal || (extraOuterClassName.length > 0 && extraOuterClassName.includes("translate-y"))
      ? BOTTOM_NAV_OUTER_MOTION
      : "",
    extraOuterClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const nav = (
    <nav className={outerClass} aria-label="주요 메뉴">
      <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`}>
        <div className="app-bottom-nav-grid">
          {tabs.map((tab) => {
            const guardNav = () => {
              const targetHref =
                tab.id === "chat" ? bottomNavMessengerHrefWithOrigin(tab.href, pathname) : tab.href;
              if (!guardBeforeNavigate(targetHref)) return false;
              if (!tab.href.includes("/community-messenger")) return true;
              const user = getCurrentUser();
              if (!user?.id) return true;
              if (clientHasVerifiedContactForInteractive(user)) return true;
              openPhoneVerificationRequiredDialog({ next: targetHref });
              return false;
            };
            return tab.icon === "stores" ? (
              <BottomNavTabStores
                key={tab.id}
                tab={tab}
                pathname={pathname}
                navSearch={navSearch}
                pendingActiveTabId={pendingActiveTabId}
                onNavigationIntent={markBottomNavIntent}
                beginMenuNavigation={beginBottomNavNavigation}
                guardBeforeNavigate={guardNav}
              />
            ) : (
              <BottomNavTabStandard
                key={tab.id}
                tab={tab}
                pathname={pathname}
                navSearch={navSearch}
                pendingActiveTabId={pendingActiveTabId}
                onNavigationIntent={markBottomNavIntent}
                beginMenuNavigation={beginBottomNavNavigation}
                guardBeforeNavigate={guardNav}
              />
            );
          })}
        </div>
      </div>
    </nav>
  );

  if (hideBottomNavShell) return null;

  if (bodyPortal && portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }
  return <>{nav}</>;
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

/** 거래·마켓 피드 탭 — 양방향 화살표(교환·거래 느낌, 집 아이콘과 구분) */
function TradeTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
  );
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  );
}

function StoreTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9zm8 4v2m-4-2v2"
      />
    </svg>
  );
}

/** 매장·거래 주문 허브 탭 */
function OrdersTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function MyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
