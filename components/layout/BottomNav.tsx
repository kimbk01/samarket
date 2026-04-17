"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { refreshOwnerHubBadgeIfHubPath } from "@/lib/chats/owner-hub-badge-store";
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
} from "@/lib/app/fetch-main-bottom-nav-deduped";
import { KASAMA_MAIN_BOTTOM_NAV_UPDATED } from "@/lib/chats/chat-channel-events";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { cancelScheduledWhenBrowserIdle, isConstrainedNetwork, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS,
  BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS,
  BOTTOM_NAV_PREFETCH_SPREAD_MS,
} from "@/lib/performance/chrome-navigation-policy";
import {
  shouldEnableNextLinkPrefetchOnMainNav,
  shouldRunBottomNavProgrammaticPrefetch,
} from "@/lib/runtime/next-js-dev-client";
import { samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

/** 프로그램적 prefetch 상한 — 메뉴 전환 직후 메인 스레드·RSC 경쟁 완화 */
const MAIN_BOTTOM_NAV_PREFETCH_MAX = 2;

function findLongestMatchingBottomNavTabIndex(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[]
): number {
  const p = pathname?.trim() ?? "";
  if (!p) return 0;
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < tabs.length; i++) {
    const h = tabs[i]?.href?.trim() ?? "";
    if (!h) continue;
    if (p === h || p.startsWith(`${h}/`)) {
      if (h.length > bestLen) {
        bestLen = h.length;
        bestIdx = i;
      }
    }
  }
  if (bestLen < 0) return 0;
  return bestIdx;
}

/**
 * 현재 경로 기준 **탭바에서 바로 옆 탭 1개**를 우선하고, 여유가 있으면 **거래채팅 메신저 허브**를 둘째로 둔다.
 * (기존: 모든 탭 + trade 허브를 spread 로 연쇀 prefetch → 동시에 여러 RSC prefetch 가 겹칠 수 있음)
 */
function pickMainBottomNavPrefetchHrefs(
  pathname: string | null,
  tabs: readonly BottomNavItemConfig[]
): string[] {
  const list = tabs.length > 0 ? tabs : BOTTOM_NAV_ITEMS;
  const tradeHub = TRADE_CHAT_SURFACE.messengerListHref.trim();
  const messengerPathPrefix = "/community-messenger";
  const p = pathname?.trim() ?? "";

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

  const neighborHref = list[(activeIdx + 1) % n]?.href?.trim() ?? "";
  push(neighborHref);

  if (out.length < MAIN_BOTTOM_NAV_PREFETCH_MAX && tradeHub && !p.startsWith(messengerPathPrefix)) {
    const tradePathOnly = tradeHub.split("?")[0] ?? "";
    if (tradePathOnly && !p.startsWith(`${tradePathOnly}/`) && p !== tradePathOnly) {
      push(tradeHub);
    }
  }

  return out.slice(0, MAIN_BOTTOM_NAV_PREFETCH_MAX);
}

/** `/home` 에서만 push — 그 외 탭 간 이동은 replace(히스토리 누적·뒤로가기 꼬임 완화) */
function mainTabLinkUsesReplace(pathname: string | null, targetHref: string): boolean {
  if (!pathname) return true;
  if (pathname === "/home" && targetHref !== "/home") return false;
  return true;
}

type BottomNavI18n = ReturnType<typeof useI18n>;
type BottomNavRouter = ReturnType<typeof useRouter>;

function BottomNavTabStandard({
  tab,
  pathname,
  tt,
  t,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  tt: BottomNavI18n["tt"];
  t: BottomNavI18n["t"];
}) {
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  const isActive = pathname === tab.href || (pathname?.startsWith(tab.href + "/") ?? false);
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
    "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
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
          {tabBadgeCount > 0 ? (
            <span className={OWNER_HUB_BADGE_DOT_CLASS}>
              {tabBadgeCount > 99 ? "99+" : tabBadgeCount}
            </span>
          ) : null}
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
    >
      {inner}
    </Link>
  );
}

function BottomNavTabStores({
  tab,
  pathname,
  tt,
  t,
  router,
  refreshBusinessHubGate,
  setBusinessHubBlockedModalOpen,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  tt: BottomNavI18n["tt"];
  t: BottomNavI18n["t"];
  router: BottomNavRouter;
  refreshBusinessHubGate: () => Promise<boolean>;
  setBusinessHubBlockedModalOpen: (open: boolean) => void;
}) {
  const ownerStore = useOwnerLitePreferredStoreRow();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount("stores");
  const storeDeepLink = useOwnerHubBadgeStoreDeepLink();
  const storeDeepLinkNavBusyRef = useRef(false);
  const isActive = pathname === tab.href || (pathname?.startsWith(tab.href + "/") ?? false);
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
  const storesNavWithAttention =
    tabBadgeCount > 0 && typeof storeDeepLink === "string" && storeDeepLink.length > 0;

  const className = [
    "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
    storesTabOwnerLite && !isActive
      ? "rounded-ui-rect bg-sam-surface/70 shadow-[0_1px_4px_rgba(15,23,42,0.08)] ring-1 ring-sam-border/70"
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
          {tabBadgeCount > 0 ? (
            <span className={OWNER_HUB_BADGE_DOT_CLASS}>
              {tabBadgeCount > 99 ? "99+" : tabBadgeCount}
            </span>
          ) : null}
        </span>
      </span>
      <span className={isActive ? labelActive : labelInactive}>{tab.labelKey ? t(tab.labelKey) : tt(tab.label)}</span>
    </>
  );

  if (storesNavWithAttention && storeDeepLink) {
    return (
      <a
        href={tab.href}
        className={className}
        aria-label={ariaLbl}
        onClick={(e) => {
          e.preventDefault();
          if (storeDeepLinkNavBusyRef.current) return;
          storeDeepLinkNavBusyRef.current = true;
          void (async () => {
            try {
              if (shouldInterceptBusinessHubHref(storeDeepLink)) {
                const block = await refreshBusinessHubGate();
                if (block) {
                  setBusinessHubBlockedModalOpen(true);
                  return;
                }
              }
              router.push(storeDeepLink);
            } finally {
              storeDeepLinkNavBusyRef.current = false;
            }
          })();
        }}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={tab.href}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav()}
      replace={mainTabLinkUsesReplace(pathname ?? null, tab.href)}
      scroll={false}
      className={className}
      aria-label={ariaLbl}
    >
      {inner}
    </Link>
  );
}

const TAB_ICONS: Record<BottomNavIconKey, (props: { className?: string }) => React.ReactNode> = {
  home: HomeIcon,
  trade: TradeTabIcon,
  community: CommunityIcon,
  stores: StoreTabIcon,
  orders: OrdersTabIcon,
  chat: ChatIcon,
  my: MyIcon,
};

export function BottomNav() {
  const { tt, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { hubBlockedModal, refresh: refreshBusinessHubGate, setModalOpen: setBusinessHubBlockedModalOpen } =
    useStoreBusinessHubEntryModal(t("common_confirm"), { eager: false });
  const [tabs, setTabs] = useState<BottomNavItemConfig[]>(() => [...BOTTOM_NAV_ITEMS]);
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const prevPathnameForNavRef = useRef<string | null>(null);
  const isChatRoomDetail =
    (pathname?.match(/^\/community-messenger\/rooms\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/chats\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/mypage\/trade\/chat\/[^/]+\/?$/) ?? false);

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
    void applyMainBottomNavItems(false);
  }, [pathname, applyMainBottomNavItems]);

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
    refreshOwnerHubBadgeIfHubPath(pathname ?? null);
  }, [pathname]);

  /**
   * 주요 탭 RSC 선로딩 — **최대 2개 href**, idle 이후 **순차** prefetch (동시 다발 제거).
   * - 1순위: 탭바에서 현재 탭의 **다음 이웃** (사용자가 한 칸 옆으로 이동할 확률이 가장 높음)
   * - 2순위(옵션): 메신저 트리 밖에 있을 때만 **거래채팅 메신저 허브** (`TRADE_CHAT_SURFACE.messengerListHref`)
   * - `chrome-navigation-policy`: 디바운스 → idle 유지, 두 번째는 `SPREAD_MS` 만큼 뒤에 1회만 스케줄
   * - `NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH=1` 로 전체 끔
   * - `tabs` 는 ref 로만 읽어 배지·기타 네비 리렌더와 분리
   */
  useEffect(() => {
    if (!shouldRunBottomNavProgrammaticPrefetch()) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    let cancelled = false;
    let idleId = -1;
    let chainTimer: number | null = null;

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
          } catch {
            /* no-op */
          }
          if (idx + 1 < hrefs.length) {
            chainTimer = window.setTimeout(() => runPrefetchAt(idx + 1), BOTTOM_NAV_PREFETCH_SPREAD_MS);
          }
        };
        runPrefetchAt(0);
      }, BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS);
    }, BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
      cancelScheduledWhenBrowserIdle(idleId);
      if (chainTimer != null) {
        window.clearTimeout(chainTimer);
        chainTimer = null;
      }
    };
  }, [pathname, router]);

  if (isChatRoomDetail) return null;

  return (
    <>
    {hubBlockedModal}
    <nav
      className={`${BOTTOM_NAV_SHELL.navClassName} ${BOTTOM_NAV_SHELL.heightClass} min-w-0 max-w-full justify-center overflow-x-hidden`}
    >
      <div className={`${APP_MAIN_COLUMN_CLASS} flex h-full min-w-0 max-w-full`}>
        {tabs.map((tab) =>
          tab.icon === "stores" ? (
            <BottomNavTabStores
              key={tab.id}
              tab={tab}
              pathname={pathname}
              tt={tt}
              t={t}
              router={router}
              refreshBusinessHubGate={refreshBusinessHubGate}
              setBusinessHubBlockedModalOpen={setBusinessHubBlockedModalOpen}
            />
          ) : (
            <BottomNavTabStandard
              key={tab.id}
              tab={tab}
              pathname={pathname}
              tt={tt}
              t={t}
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
