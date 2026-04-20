"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  areBottomNavItemConfigsEqual,
  BOTTOM_NAV_ITEMS,
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
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import {
  useOwnerLiteHasPreferredStore,
  useOwnerLitePreferredStoreRow,
} from "@/lib/stores/use-owner-lite-store";
import {
  fetchMainBottomNavDeduped,
  MAIN_BOTTOM_NAV_LS_REV_KEY,
  primeMainBottomNavDedupedCache,
} from "@/lib/app/fetch-main-bottom-nav-deduped";
import { KASAMA_MAIN_BOTTOM_NAV_UPDATED } from "@/lib/chats/chat-channel-events";
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
import { bumpMessengerRenderPerf, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";

/**
 * 프로그램적 `router.prefetch` 상한 — 리스트·피드가 커져도 **탭 전환 경로가 무거워지지 않게** 짧게 유지.
 * (각 탭 `Link prefetch` 는 그대로; 여기는 idle 보조만)
 */
const MAIN_BOTTOM_NAV_PREFETCH_MAX = 3;

function findLongestMatchingBottomNavTabIndex(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[]
): number {
  const raw = pathname?.trim() ?? "";
  const p = raw.split("?")[0] ?? "";
  if (!p) return 0;
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < tabs.length; i++) {
    const h = tabs[i]?.href?.trim() ?? "";
    if (!h) continue;
    const tradeAliasHome = h === "/home" && (p === "/market" || p.startsWith("/market/"));
    if (p === h || p.startsWith(`${h}/`) || tradeAliasHome) {
      const effectiveLen = tradeAliasHome ? Math.max(h.length, "/market".length) : h.length;
      if (effectiveLen > bestLen) {
        bestLen = effectiveLen;
        bestIdx = i;
      }
    }
  }
  if (bestLen < 0) return 0;
  return bestIdx;
}

/**
 * 메신저 목록 → 거래(`/home`) → 내정보(`/mypage`) → 이웃 탭 순으로 후보를 쌓고 **상한만** 자른다.
 * 거래 채팅 허브 URL은 `Link prefetch` 에 맡기고, idle 보조는 메인 3종만(장시간 누적 부하 방지).
 */
function pickMainBottomNavPrefetchHrefs(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[]
): string[] {
  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const messengerListHref = "/community-messenger";
  const homeHref = "/home";
  const mypageHref = "/mypage";
  const raw = pathname?.trim() ?? "";
  const p = raw.split("?")[0] ?? "";
  const pathNorm = (p.replace(/\/+$/, "") || "/") as string;
  const onMessengerListOnly = pathNorm === messengerListHref;
  const onTradeFeedSurface = pathNorm === homeHref || pathNorm.startsWith("/market");
  const onMypageSurface = pathNorm === mypageHref || pathNorm.startsWith(`${mypageHref}/`);

  const activeIdx = findLongestMatchingBottomNavTabIndex(pathname, list);
  const n = list.length;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (href: string) => {
    const h = href.trim();
    if (!h || seen.has(h)) return;
    if (p === h || p.startsWith(`${h}/`)) return;
    seen.add(h);
    out.push(h);
  };

  if (!onMessengerListOnly) {
    push(messengerListHref);
  }
  if (!onTradeFeedSurface) {
    push(homeHref);
  }
  if (!onMypageSurface) {
    push(mypageHref);
  }

  const neighborHref = list[(activeIdx + 1) % n]?.href?.trim() ?? "";
  push(neighborHref);

  return out.slice(0, MAIN_BOTTOM_NAV_PREFETCH_MAX);
}

/** `/home` 에서만 push — 그 외 탭 간 이동은 replace(히스토리 누적·뒤로가기 꼬임 완화) */
function mainTabLinkUsesReplace(pathname: string | null, targetHref: string): boolean {
  if (!pathname) return true;
  if (pathname === "/home" && targetHref !== "/home") return false;
  return true;
}

/** 탭 `href` 기준 활성 — 거래 허브는 `/home` 탭에 묶이며 `/market` 도 동일 탭으로 본다 */
function isBottomNavTabActive(pathname: string | null, tabHref: string): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const h = tabHref.split("?")[0]?.trim() ?? "";
  if (!p || !h) return false;
  if (p === h || p.startsWith(`${h}/`)) return true;
  if (h === "/home" && (p === "/market" || p.startsWith("/market/"))) return true;
  return false;
}

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[color,transform,background-color,opacity] duration-150 ease-out active:scale-[0.96]";

function triggerLightTapFeedback(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    /* noop */
  }
}

const BottomNavHubBadgeDot = memo(function BottomNavHubBadgeDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={OWNER_HUB_BADGE_DOT_CLASS}>
      {count > 99 ? "99+" : count}
    </span>
  );
});

function scrollAppShellToTop(): void {
  if (typeof document === "undefined") return;
  const mainEl = document.querySelector("main");
  try {
    mainEl?.scrollTo?.({ top: 0, behavior: "smooth" });
  } catch {
    try {
      mainEl?.scrollTo?.(0, 0);
    } catch {
      /* noop */
    }
  }
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
}

function onBottomNavTabActivate(pathname: string | null, tabHref: string, e: MouseEvent<HTMLAnchorElement>): void {
  triggerLightTapFeedback();
  if (!isBottomNavTabActive(pathname, tabHref)) return;
  e.preventDefault();
  scrollAppShellToTop();
}

const BottomNavTabStandard = memo(function BottomNavTabStandard({
  tab,
  pathname,
  optimisticActive,
  onNavigationIntent,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  optimisticActive: boolean;
  onNavigationIntent: (tabId: string) => void;
}) {
  const { tt, t } = useI18n();
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  const isActive = optimisticActive || isBottomNavTabActive(pathname, tab.href);
  const Icon = TAB_ICONS[tab.icon];
  const iconActive = tab.iconActiveClass ?? BOTTOM_NAV_THEME.iconActiveClass;
  const iconInactive = tab.iconInactiveClass ?? BOTTOM_NAV_THEME.iconInactiveClass;
  const labelSize = tab.labelSizeClass ?? BOTTOM_NAV_THEME.labelSizeClass;
  const labelFontFam = tab.labelFontFamilyClass ?? "";
  const labelActive =
    [labelSize, labelFontFam, tab.labelActiveClass ?? BOTTOM_NAV_THEME.labelActiveClass, tab.labelActiveExtraClass]
      .filter(Boolean)
      .join(" ");
  const labelInactive =
    [labelSize, labelFontFam, tab.labelInactiveClass ?? BOTTOM_NAV_THEME.labelInactiveClass, tab.labelInactiveExtraClass]
      .filter(Boolean)
      .join(" ");
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const className = [
    "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signature/35",
    isActive ? "bg-signature/10 ring-1 ring-signature/15" : "",
    hasOwnerStore && !isActive ? "opacity-80" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), count: tabBadgeCount })
      : undefined;

  const inner = (
    <>
      <span className={isActive ? iconActive : iconInactive}>
        <span className="relative inline-flex">
          <Icon className={iconSize} />
          <BottomNavHubBadgeDot count={tabBadgeCount} />
        </span>
      </span>
      <span className={isActive ? labelActive : labelInactive}>{tab.labelKey ? t(tab.labelKey) : tt(tab.label)}</span>
    </>
  );

  return (
    <Link
      href={tab.href}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav()}
      replace={mainTabLinkUsesReplace(pathname ?? null, tab.href)}
      scroll={false}
      className={className}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerDown={() => onNavigationIntent(tab.id)}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Enter" || e.key === " ") onNavigationIntent(tab.id);
      }}
      onClick={(e) => onBottomNavTabActivate(pathname, tab.href, e)}
    >
      {inner}
    </Link>
  );
});

const BottomNavTabStores = memo(function BottomNavTabStores({
  tab,
  pathname,
  optimisticActive,
  onNavigationIntent,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  optimisticActive: boolean;
  onNavigationIntent: (tabId: string) => void;
}) {
  const { tt, t } = useI18n();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount("stores");
  const _storeDeepLink = useOwnerHubBadgeStoreDeepLink();
  const isActive = optimisticActive || isBottomNavTabActive(pathname, tab.href);
  const Icon = TAB_ICONS.stores;
  const iconActive = tab.iconActiveClass ?? BOTTOM_NAV_THEME.iconActiveClass;
  const iconInactive = tab.iconInactiveClass ?? BOTTOM_NAV_THEME.iconInactiveClass;
  const labelSize = tab.labelSizeClass ?? BOTTOM_NAV_THEME.labelSizeClass;
  const labelFontFam = tab.labelFontFamilyClass ?? "";
  const labelActive =
    [labelSize, labelFontFam, tab.labelActiveClass ?? BOTTOM_NAV_THEME.labelActiveClass, tab.labelActiveExtraClass]
      .filter(Boolean)
      .join(" ");
  const labelInactive =
    [labelSize, labelFontFam, tab.labelInactiveClass ?? BOTTOM_NAV_THEME.labelInactiveClass, tab.labelInactiveExtraClass]
      .filter(Boolean)
      .join(" ");
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const storesTabOwnerLite = !!ownerStore;

  const className = [
    "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2",
    storesTabOwnerLite && !isActive ? "rounded-ui-rect" : "rounded-xl",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signature/35",
    isActive ? "bg-signature/10 ring-1 ring-signature/15" : "",
    storesTabOwnerLite && !isActive
      ? "bg-sam-surface/70 shadow-[0_1px_4px_rgba(15,23,42,0.08)] ring-1 ring-sam-border/70"
      : "",
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
      <span className={isActive ? iconActive : iconInactive}>
        <span className="relative inline-flex">
          <Icon className={iconSize} />
          <BottomNavHubBadgeDot count={tabBadgeCount} />
        </span>
      </span>
      <span className={isActive ? labelActive : labelInactive}>{tab.labelKey ? t(tab.labelKey) : tt(tab.label)}</span>
    </>
  );

  return (
    <Link
      href={tab.href}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav()}
      replace={mainTabLinkUsesReplace(pathname ?? null, tab.href)}
      scroll={false}
      className={className}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerDown={() => onNavigationIntent(tab.id)}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Enter" || e.key === " ") onNavigationIntent(tab.id);
      }}
      onClick={(e) => onBottomNavTabActivate(pathname, tab.href, e)}
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

export function BottomNav({ initialTabs = null }: { initialTabs?: BottomNavItemConfig[] | null }) {
  bumpMessengerRenderPerf("messenger_bottom_nav_render");
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<BottomNavItemConfig[]>(() =>
    initialTabs && initialTabs.length > 0 ? initialTabs.map((tab) => ({ ...tab })) : [...BOTTOM_NAV_ITEMS]
  );
  const [pendingActiveTabId, setPendingActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  /** 브라우저 `window.setTimeout` id — `@types/node` 의 `ReturnType<typeof setTimeout>` 과 분리 */
  const pendingActiveResetTimerRef = useRef<number | null>(null);
  const lastPathnameForPendingRef = useRef<string | null>(pathname ?? null);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useLayoutEffect(() => {
    if (!initialTabs || initialTabs.length <= 0) return;
    primeMainBottomNavDedupedCache(initialTabs);
    setTabs((prev) => (areBottomNavItemConfigsEqual(prev, initialTabs) ? prev : initialTabs.map((tab) => ({ ...tab }))));
  }, [initialTabs]);
  const prevPathnameForNavRef = useRef<string | null>(null);
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

  const applyMainBottomNavItems = useCallback(async (force: boolean) => {
    try {
      const { ok, items } = await fetchMainBottomNavDeduped({ force });
      if (!ok || !items?.length) return;
      setTabs((prev) => (areBottomNavItemConfigsEqual(prev, items) ? prev : items));
    } catch {
      /* 코드 기본 탭 유지 */
    }
  }, []);

  /**
   * 하단 탭 설정: 최초 마운트 1회 + 관리자(/admin/*) 이탈 시 강제 재조회.
   * (경로만 바뀔 때마다 호출하면 TTL 캐시 히트여도 불필요한 setState·작업이 반복됨)
   */
  useEffect(() => {
    const cur = pathname ?? "";
    const prev = prevPathnameForNavRef.current;
    prevPathnameForNavRef.current = cur;
    const leftAdminSurface =
      Boolean(prev && cur) && (prev?.startsWith("/admin") ?? false) && !cur.startsWith("/admin");
    if (leftAdminSurface) {
      void applyMainBottomNavItems(true);
      return;
    }
    if (prev !== null) return;
    if (initialTabs && initialTabs.length > 0) return;
    void applyMainBottomNavItems(false);
  }, [pathname, applyMainBottomNavItems, initialTabs]);

  useEffect(() => {
    const onRemoteUpdate = () => void applyMainBottomNavItems(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MAIN_BOTTOM_NAV_LS_REV_KEY || e.newValue == null) return;
      void applyMainBottomNavItems(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
        window.removeEventListener("storage", onStorage);
      }
    };
  }, [applyMainBottomNavItems]);

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
   * 주요 탭 RSC idle 선로딩 — **상한 `MAIN_BOTTOM_NAV_PREFETCH_MAX`**, 순차 `router.prefetch`.
   * 경로가 바뀌면 **연쇄 setTimeout 전부 취소**해 장시간 사용 시 작업이 쌓이지 않게 한다.
   * `NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH=1` 로 끔.
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
        const hrefs = pickMainBottomNavPrefetchHrefs(pathname ?? null, tabsRef.current);
        if (hrefs.length === 0) return;

        const runPrefetchAt = (idx: number) => {
          if (cancelled || idx >= hrefs.length) return;
          const href = hrefs[idx];
          try {
            samarketRuntimeDebugLog("bottom-nav-prefetch", "router.prefetch", {
              href,
              pathname: pathname ?? null,
              index: idx,
              total: hrefs.length,
            });
            router.prefetch(href);
            const pathOnly = (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
            if (pathOnly === "/community-messenger") {
              warmMessengerListBootstrapClient();
            }
          } catch {
            /* no-op */
          }
          if (idx + 1 < hrefs.length) {
            chainTimers.push(
              window.setTimeout(() => runPrefetchAt(idx + 1), BOTTOM_NAV_PREFETCH_SPREAD_MS)
            );
          }
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
  }, [pathname, router]);

  if (isChatRoomDetail) return null;

  return (
    <>
    <nav
      className={`${BOTTOM_NAV_SHELL.navClassName} ${BOTTOM_NAV_SHELL.heightClass} min-w-0 max-w-full justify-center overflow-x-hidden`}
      aria-label={t("nav_bottom_bar_aria")}
    >
      <div className={`${APP_MAIN_COLUMN_CLASS} flex h-full min-w-0 max-w-full`}>
        {tabs.map((tab) =>
          tab.icon === "stores" ? (
            <BottomNavTabStores
              key={tab.id}
              tab={tab}
              pathname={pathname}
              optimisticActive={pendingActiveTabId === tab.id}
              onNavigationIntent={markBottomNavIntent}
            />
          ) : (
            <BottomNavTabStandard
              key={tab.id}
              tab={tab}
              pathname={pathname}
              optimisticActive={pendingActiveTabId === tab.id}
              onNavigationIntent={markBottomNavIntent}
            />
          )
        )}
      </div>
    </nav>
    </>
  );
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
