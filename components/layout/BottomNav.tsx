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
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOTTOM_NAV_BADGE_RING_CLASS,
  BOTTOM_NAV_OUTER_MOTION,
  BOTTOM_NAV_SCROLL_HIDDEN_CLASS,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_THEME,
  bottomNavUsesDeliveryHubShell,
  type BottomNavIconKey,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  useOwnerHubBadgeStoreDeepLink,
  useOwnerHubBadgeTabUnreadCount,
} from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import {
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
import { commitMainBottomNavRoute, mainBottomNavRouteUsesReplace } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { openBottomNavHref } from "@/lib/main-menu/bottom-nav-link-open";
import { isCommunityMessengerRoomPathname } from "@/lib/layout/conditional-app-shell-flags";
import { bumpMessengerRenderPerf, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";
import { scheduleWarmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client-loader";
import {
  mainBottomNavPrefetchTriggerKey,
  type MainBottomNavPrefetchDomain,
} from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import {
  isBottomNavTabActive,
  isMainBottomNavMessengerShellPathname,
  pickMainBottomNavPrefetchHrefs,
  resolveBottomNavTabProgrammaticPrefetchHref,
} from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import {
  composeMainBottomNavDisplayTabs,
  resolveMainBottomNavSecondaryRailKind,
} from "@/lib/main-menu/main-bottom-nav-split-layout";
import {
  DELIVERY_BOTTOM_NAV_LABEL_CLASS,
  isDeliveryBottomNavTabId,
  isDeliveryConsumerBottomNavSurface,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
import {
  isPhilifeBottomNavTabId,
  PHILIFE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/main-menu/philife-bottom-nav-layout";
import {
  isTradeBottomNavTabId,
  TRADE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/main-menu/trade-bottom-nav-layout";
import {
  TRADE_HOME_HUB_LONG_PRESS_MS,
  runTradeHomeHubLongPress,
  runTradeHomeHubShortTap,
} from "@/lib/trade/trade-home-hub-navigation";
import { writeStoredMypageBottomNavOrigin } from "@/lib/main-menu/mypage-bottom-nav-origin";
import {
  DELIVERY_HOME_HUB_LONG_PRESS_MS,
  runDeliveryHomeHubLongPress,
  runDeliveryHomeHubShortTap,
} from "@/lib/delivery/delivery-home-hub-navigation";
import {
  markBottomNavRouteIntentForBackgroundWarm,
  remainingBottomNavBackgroundPrefetchQuietMs,
} from "@/lib/navigation/mark-bottom-nav-route-intent";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
import { MAIN_BOTTOM_NAV_TAB_ICONS } from "@/components/main-menu/MainBottomNavTabIcons";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import {
  bottomNavMessengerHrefWithOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { shouldDeferUnreadBadgeRepaint } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { useRegion, useRegionOptional } from "@/contexts/RegionContext";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";

/** 매장 운영 허브 — cross-tab RSC·taxonomy·philife prewarm 금지 (`pickMainBottomNavPrefetchHrefs` 와 동일) */
function shouldSkipBottomNavBackgroundPrefetch(pathname: string | null): boolean {
  const domain: MainBottomNavPrefetchDomain = mainBottomNavPrefetchTriggerKey(pathname);
  return domain === "store_owner" || isMainBottomNavMessengerShellPathname(pathname);
}

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

const BottomNavHubBadgeDot = memo(function BottomNavHubBadgeDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={`bottom-nav-hub-badge ${OWNER_HUB_BADGE_DOT_CLASS} ${BOTTOM_NAV_BADGE_RING_CLASS}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
});

type BottomNavActivateEvent = Pick<MouseEvent<HTMLAnchorElement>, "preventDefault">;

/**
 * 하단 탭 활성화 단일 경로.
 * Enter 는 브라우저 기본 anchor click, Space 는 click 합성으로만 들어온다.
 */
function runBottomNavTabClick(
  e: BottomNavActivateEvent,
  opts: {
    pathname: string | null;
    navSearch: string;
    href: string;
    tabId: string;
    isActive: boolean;
    beginMenuNavigation: (href: string) => void;
    onNavigationIntent: (tabId: string) => void;
    guardBeforeNavigate: (nextHref?: string) => boolean;
    router: Pick<ReturnType<typeof useRouter>, "prefetch" | "push" | "replace">;
    onPrewarm?: () => void;
    onCloseDomainSwitcher?: () => void;
  }
): void {
  e.preventDefault();
  commitMainBottomNavRoute({
    pathname: opts.pathname,
    currentSearch: opts.navSearch,
    href: opts.href,
    tabId: opts.tabId,
    prefetchWhenInactive: !opts.isActive,
    beginMenuNavigation: opts.beginMenuNavigation,
    onNavigationIntent: opts.onNavigationIntent,
    guardBeforeNavigate: opts.guardBeforeNavigate,
    push: (href) => opts.router.push(href),
    replace: (href) => opts.router.replace(href),
    prefetch: (href) => {
      try {
        void opts.router.prefetch(href);
      } catch {
        /* noop */
      }
    },
    onPrewarm: opts.onPrewarm,
    onCloseDomainSwitcher: opts.onCloseDomainSwitcher,
    persistMessengerOriginFromHref:
      opts.tabId === "chat" ||
      opts.tabId === "delivery-order-chat" ||
      opts.tabId === "philife-messenger" ||
      opts.tabId === "trade-order-chat",
  });
}

function runBottomNavTabClickOrOpenNew(
  e: BottomNavActivateEvent,
  tab: BottomNavItemConfig,
  href: string,
  opts: Omit<Parameters<typeof runBottomNavTabClick>[1], "href" | "tabId">
): void {
  if (tab.openInNewTab) {
    e.preventDefault();
    openBottomNavHref(href, true);
    return;
  }
  runBottomNavTabClick(e, { ...opts, href, tabId: tab.id });
}

const BottomNavTabStandard = memo(function BottomNavTabStandard({
  tab,
  itemClassName = "",
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  /** 탭 이동 직후 — pathname 갱신 전에도 **한 탭만** 활성으로 보이게 함(이전 경로 탭이 남는 체감 제거) */
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
}) {
  const { tt, t, safeT } = useI18n();
  const router = useRouter();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const ownerStore = useOwnerLitePreferredStoreRow();
  const searchParams = useSearchParams();
  const secondaryRail = useMemo(
    () => resolveMainBottomNavSecondaryRailKind(pathname, searchParams),
    [pathname, searchParams]
  );
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const effectiveHref = useMemo(() => {
    if (tab.id === "delivery-orders") {
      return resolveDeliveryOrderHistoryHref(ownerStore?.id);
    }
    if (tab.id === "chat" || tab.id === "philife-messenger" || tab.id === "trade-order-chat") {
      return bottomNavMessengerHrefWithOrigin(tab.href, pathname, searchParams);
    }
    return tab.href;
  }, [tab.id, tab.href, pathname, searchParams, ownerStore?.id]);

  const className = [
    "app-bottom-nav-item group",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    itemClassName,
    tab.id === "my" || tab.id === "delivery-my" || tab.id === "philife-my" || tab.id === "trade-my"
      ? "app-bottom-nav-item--my-menu"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tabLabel, count: tabBadgeCount })
      : tab.id === "my"
        ? t("nav.my")
        : undefined;

  const inner = (
    <>
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={isActive ? "on" : "off"}>
          <MainBottomNavTabIcon tab={tab} className={iconSize} />
          <BottomNavHubBadgeDot count={tabBadgeCount} />
        </span>
      </div>
      <span
        className={
          isDeliveryBottomNavTabId(tab.id) ||
          isPhilifeBottomNavTabId(tab.id) ||
          isTradeBottomNavTabId(tab.id)
            ? isTradeBottomNavTabId(tab.id)
              ? TRADE_BOTTOM_NAV_LABEL_CLASS
              : isPhilifeBottomNavTabId(tab.id)
                ? PHILIFE_BOTTOM_NAV_LABEL_CLASS
                : DELIVERY_BOTTOM_NAV_LABEL_CLASS
            : `app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`
        }
        suppressHydrationWarning
      >
        {tabLabel}
      </span>
    </>
  );

  return (
    <Link
      href={effectiveHref}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav() && !isMainBottomNavMessengerShellPathname(pathname)}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, effectiveHref)}
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
        if (e.key === "Enter") return;
        if (e.key !== " ") return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      onClick={(e) => {
        runBottomNavTabClickOrOpenNew(e, tab, effectiveHref, {
          pathname,
          navSearch,
          isActive,
          beginMenuNavigation,
          onNavigationIntent,
          guardBeforeNavigate,
          router,
          onCloseDomainSwitcher,
        });
      }}
    >
      {inner}
    </Link>
  );
});

const BottomNavTabDeliveryHomeHub = memo(function BottomNavTabDeliveryHomeHub({
  tab,
  itemClassName = "",
  pathname,
  switcherOpen,
  onToggleSwitcher,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const navSearch = searchParams.toString();
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tab.label;
  const Icon = TAB_ICONS.home;
  const hubPathActive = isMainBottomNavDisplayTabActive(pathname, tab, {
    searchParams,
    secondaryRail: "stores",
  });
  const isActive = switcherOpen || hubPathActive;
  const className = [
    "app-bottom-nav-item group app-bottom-nav-item--delivery-hub",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    itemClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const longPressFiredRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const runLongPressHome = useCallback(() => {
    longPressFiredRef.current = true;
    runDeliveryHomeHubLongPress({
      pathname,
      currentSearch: navSearch,
      href: tab.href,
      switcherOpen,
      onCloseSwitcher: () => {
        if (switcherOpen) onToggleSwitcher();
      },
      guardBeforeNavigate,
      beginMenuNavigation,
      onNavigationIntent,
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
    });
  }, [
    beginMenuNavigation,
    guardBeforeNavigate,
    navSearch,
    onNavigationIntent,
    onToggleSwitcher,
    pathname,
    router,
    switcherOpen,
    tab.href,
  ]);

  const onHubPointerUp = useCallback(() => {
    clearLongPressTimer();
    const longPressFired = longPressFiredRef.current;
    longPressFiredRef.current = false;
    runDeliveryHomeHubShortTap({
      pathname,
      currentSearch: navSearch,
      href: tab.href,
      switcherOpen,
      onCloseSwitcher: () => {
        if (switcherOpen) onToggleSwitcher();
      },
      guardBeforeNavigate,
      beginMenuNavigation,
      onNavigationIntent,
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
      longPressFired,
      onToggleSwitcher,
    });
  }, [
    beginMenuNavigation,
    clearLongPressTimer,
    guardBeforeNavigate,
    navSearch,
    onNavigationIntent,
    onToggleSwitcher,
    pathname,
    router,
    switcherOpen,
    tab.href,
  ]);

  const onHubPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      longPressFiredRef.current = false;
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        runLongPressHome();
      }, DELIVERY_HOME_HUB_LONG_PRESS_MS);
      try {
        prewarmBottomNavTapHrefResolvingStoresRegion(tab.href, primaryRegion);
      } catch {
        /* noop */
      }
    },
    [clearLongPressTimer, primaryRegion, runLongPressHome, tab.href]
  );

  const onHubKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      longPressFiredRef.current = false;
      runDeliveryHomeHubShortTap({
        pathname,
        currentSearch: navSearch,
        href: tab.href,
        switcherOpen,
        onCloseSwitcher: () => {
          if (switcherOpen) onToggleSwitcher();
        },
        guardBeforeNavigate,
        beginMenuNavigation,
        onNavigationIntent,
        push: (href) => router.push(href),
        replace: (href) => router.replace(href),
        longPressFired: false,
        onToggleSwitcher,
      });
    },
    [
      beginMenuNavigation,
      guardBeforeNavigate,
      navSearch,
      onNavigationIntent,
      onToggleSwitcher,
      pathname,
      router,
      switcherOpen,
      tab.href,
    ]
  );

  const onHubPointerCancel = useCallback(() => {
    clearLongPressTimer();
    longPressFiredRef.current = false;
  }, [clearLongPressTimer]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  return (
    <button
      type="button"
      className={className}
      data-active={isActive ? "true" : "false"}
      data-switcher-open={switcherOpen ? "true" : "false"}
      aria-label={tabLabel}
      aria-expanded={switcherOpen}
      aria-haspopup="dialog"
      onPointerDown={onHubPointerDown}
      onPointerUp={onHubPointerUp}
      onPointerCancel={onHubPointerCancel}
      onPointerLeave={onHubPointerCancel}
      onKeyDown={onHubKeyDown}
      onClick={(e) => e.preventDefault()}
    >
      <div className="app-bottom-nav-icon-slot app-bottom-nav-icon-slot--delivery-home">
        <span
          className={[
            "app-bottom-nav-delivery-home-orbit",
            isActive ? "app-bottom-nav-delivery-home-orbit--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Icon className="app-bottom-nav-delivery-home-icon" aria-hidden />
        </span>
      </div>
      <span className={DELIVERY_BOTTOM_NAV_LABEL_CLASS} suppressHydrationWarning>
        {tabLabel}
      </span>
    </button>
  );
});

const BottomNavTabTradeHomeHub = memo(function BottomNavTabTradeHomeHub({
  tab,
  itemClassName = "",
  pathname,
  switcherOpen,
  onToggleSwitcher,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tab.label;
  const Icon = TAB_ICONS.home;
  const hubPathActive = isMainBottomNavDisplayTabActive(pathname, tab, {
    searchParams,
    secondaryRail: "trade",
  });
  const isActive = switcherOpen || hubPathActive;
  const className = [
    "app-bottom-nav-item group app-bottom-nav-item--delivery-hub",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    itemClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const longPressFiredRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const runLongPressHome = useCallback(() => {
    longPressFiredRef.current = true;
    runTradeHomeHubLongPress({
      pathname,
      currentSearch: navSearch,
      href: tab.href,
      switcherOpen,
      onCloseSwitcher: () => {
        if (switcherOpen) onToggleSwitcher();
      },
      guardBeforeNavigate,
      beginMenuNavigation,
      onNavigationIntent,
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
    });
  }, [
    beginMenuNavigation,
    guardBeforeNavigate,
    navSearch,
    onNavigationIntent,
    onToggleSwitcher,
    pathname,
    router,
    switcherOpen,
    tab.href,
  ]);

  const onHubPointerUp = useCallback(() => {
    clearLongPressTimer();
    const longPressFired = longPressFiredRef.current;
    longPressFiredRef.current = false;
    runTradeHomeHubShortTap({
      pathname,
      currentSearch: navSearch,
      href: tab.href,
      switcherOpen,
      onCloseSwitcher: () => {
        if (switcherOpen) onToggleSwitcher();
      },
      guardBeforeNavigate,
      beginMenuNavigation,
      onNavigationIntent,
      push: (href) => router.push(href),
      replace: (href) => router.replace(href),
      longPressFired,
      onToggleSwitcher,
    });
  }, [
    beginMenuNavigation,
    clearLongPressTimer,
    guardBeforeNavigate,
    navSearch,
    onNavigationIntent,
    onToggleSwitcher,
    pathname,
    router,
    switcherOpen,
    tab.href,
  ]);

  const onHubPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      longPressFiredRef.current = false;
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        runLongPressHome();
      }, TRADE_HOME_HUB_LONG_PRESS_MS);
      try {
        prewarmBottomNavTapTargetClientCache(tab.href);
      } catch {
        /* noop */
      }
    },
    [clearLongPressTimer, runLongPressHome, tab.href]
  );

  const onHubKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      longPressFiredRef.current = false;
      runTradeHomeHubShortTap({
        pathname,
        currentSearch: navSearch,
        href: tab.href,
        switcherOpen,
        onCloseSwitcher: () => {
          if (switcherOpen) onToggleSwitcher();
        },
        guardBeforeNavigate,
        beginMenuNavigation,
        onNavigationIntent,
        push: (href) => router.push(href),
        replace: (href) => router.replace(href),
        longPressFired: false,
        onToggleSwitcher,
      });
    },
    [
      beginMenuNavigation,
      guardBeforeNavigate,
      navSearch,
      onNavigationIntent,
      onToggleSwitcher,
      pathname,
      router,
      switcherOpen,
      tab.href,
    ]
  );

  const onHubPointerCancel = useCallback(() => {
    clearLongPressTimer();
    longPressFiredRef.current = false;
  }, [clearLongPressTimer]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  return (
    <button
      type="button"
      className={className}
      data-active={isActive ? "true" : "false"}
      data-switcher-open={switcherOpen ? "true" : "false"}
      aria-label={tabLabel}
      aria-expanded={switcherOpen}
      aria-haspopup="dialog"
      onPointerDown={onHubPointerDown}
      onPointerUp={onHubPointerUp}
      onPointerCancel={onHubPointerCancel}
      onPointerLeave={onHubPointerCancel}
      onKeyDown={onHubKeyDown}
      onClick={(e) => e.preventDefault()}
    >
      <div className="app-bottom-nav-icon-slot app-bottom-nav-icon-slot--delivery-home">
        <span
          className={[
            "app-bottom-nav-delivery-home-orbit",
            isActive ? "app-bottom-nav-delivery-home-orbit--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Icon className="app-bottom-nav-delivery-home-icon" aria-hidden />
        </span>
      </div>
      <span className={TRADE_BOTTOM_NAV_LABEL_CLASS} suppressHydrationWarning>
        {tabLabel}
      </span>
    </button>
  );
});

const BottomNavTabDeliveryCart = memo(function BottomNavTabDeliveryCart({
  tab,
  itemClassName = "",
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
}) {
  const { tt, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secondaryRail = useMemo(
    () => resolveMainBottomNavSecondaryRailKind(pathname, searchParams),
    [pathname, searchParams]
  );
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const { href: effectiveHref } = useCommerceCartNavHref(tab.href);
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
  const Icon = TAB_ICONS.cart;
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;
  const className = ["app-bottom-nav-item group", BOTTOM_NAV_ITEM_TOUCH_CLASS, itemClassName].filter(Boolean).join(" ");

  return (
    <Link
      href={effectiveHref}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav() && !isMainBottomNavMessengerShellPathname(pathname)}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, effectiveHref)}
      scroll={false}
      className={className}
      data-active={isActive ? "true" : "false"}
      aria-label={tabLabel}
      aria-current={isActive ? "page" : undefined}
      onPointerDown={(e) => triggerLightTapFeedback(e)}
      onClick={(e) => {
        runBottomNavTabClickOrOpenNew(e, tab, effectiveHref, {
          pathname,
          navSearch,
          isActive,
          beginMenuNavigation,
          onNavigationIntent,
          guardBeforeNavigate,
          router,
          onCloseDomainSwitcher,
        });
      }}
    >
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={isActive ? "on" : "off"}>
          <Icon className={iconSize} />
        </span>
      </div>
      <span className={DELIVERY_BOTTOM_NAV_LABEL_CLASS} suppressHydrationWarning>
        {tabLabel}
      </span>
    </Link>
  );
});

const BottomNavTabStores = memo(function BottomNavTabStores({
  tab,
  itemClassName = "",
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (href: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
}) {
  const { tt, t, safeT } = useI18n();
  const router = useRouter();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const { primaryRegion } = useRegion();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount("stores");
  const _storeDeepLink = useOwnerHubBadgeStoreDeepLink();
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isMainBottomNavDisplayTabActive(pathname, tab);
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
    itemClassName,
    inactiveSurface,
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tabLabel, count: tabBadgeCount })
      : storesTabOwnerLite && ownerStore?.store_name
        ? t("nav_store_owner", { label: tabLabel, storeName: ownerStore.store_name })
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
        {tabLabel}
      </span>
    </>
  );

  return (
    <Link
      href={tab.href}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav() && !isMainBottomNavMessengerShellPathname(pathname)}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, tab.href)}
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
        if (e.key === "Enter") return;
        if (e.key !== " ") return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      onClick={(e) => {
        runBottomNavTabClickOrOpenNew(e, tab, tab.href, {
          pathname,
          navSearch,
          isActive,
          beginMenuNavigation,
          onNavigationIntent,
          guardBeforeNavigate,
          router,
          onPrewarm: prewarmStoresTabClientCache,
          onCloseDomainSwitcher,
        });
      }}
    >
      {inner}
    </Link>
  );
});

const TAB_ICONS = MAIN_BOTTOM_NAV_TAB_ICONS;

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
  if (!shouldDeferUnreadBadgeRepaint()) {
    bumpMessengerRenderPerf("messenger_bottom_nav_render");
  }
  const pathname = usePathname();
  /** idle 프리페치 콜백 시점의 최신 경로 — effect deps 는 도메인 키만 쓰므로 클로저 pathname 고착 방지 */
  const pathnameForPrefetchRef = useRef<string | null>(pathname ?? null);
  useLayoutEffect(() => {
    pathnameForPrefetchRef.current = pathname ?? null;
  }, [pathname]);

  /** `/mypage` 레일 — 직전 배달·거래·커뮤니티 셸을 sessionStorage 로 복원 */
  useEffect(() => {
    const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
    if (isDeliveryConsumerBottomNavSurface(p) || p === "/stores" || p.startsWith("/stores/")) {
      writeStoredMypageBottomNavOrigin("delivery");
      return;
    }
    if (p === "/market" || p.startsWith("/market/")) {
      writeStoredMypageBottomNavOrigin("trade");
      return;
    }
    if (p === "/philife" || p.startsWith("/philife/") || p === "/community" || p.startsWith("/community/")) {
      writeStoredMypageBottomNavOrigin("community");
    }
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
  const bottomNavPickCtxRef = useRef<{ searchParams: typeof searchParams; ownerStoreId?: string | null }>({
    searchParams,
    ownerStoreId: null,
  });
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
  const ownerStoreRow = useOwnerLitePreferredStoreRow();
  const displayTabs = useMemo(
    () => composeMainBottomNavDisplayTabs(pathname ?? null, tabs, searchParams, ownerStoreRow?.id),
    [pathname, tabs, searchParams, ownerStoreRow?.id]
  );
  const usesDeliveryHubShell = useMemo(
    () => bottomNavUsesDeliveryHubShell(displayTabs),
    [displayTabs]
  );
  useLayoutEffect(() => {
    bottomNavPickCtxRef.current = { searchParams, ownerStoreId: ownerStoreRow?.id };
  }, [searchParams, ownerStoreRow?.id]);
  const [pendingActiveTabId, setPendingActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef(displayTabs);
  /** 브라우저 `window.setTimeout` id — `@types/node` 의 `ReturnType<typeof setTimeout>` 과 분리 */
  const pendingActiveResetTimerRef = useRef<number | null>(null);
  const lastPathnameForPendingRef = useRef<string | null>(pathname ?? null);
  useEffect(() => {
    tabsRef.current = displayTabs;
  }, [displayTabs]);
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
        const hrefs = pickMainBottomNavPrefetchHrefs(
          pathnameForPrefetchRef.current,
          tabsRef.current,
          bottomNavPickCtxRef.current
        );
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
              scheduleWarmMessengerListBootstrapClient();
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
    if (shouldSkipBottomNavBackgroundPrefetch(at)) return;
    const hrefs = tabsRef.current
      .map((tab) => resolveBottomNavTabProgrammaticPrefetchHref(tab, at, bottomNavPickCtxRef.current))
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
  const { t } = useI18n();

  const hideBottomNavShell =
    (isChatRoomDetail && !isCommunityMessengerRoomPathname(pathname ?? null)) ||
    // 옛 `/mypage/business`·`/my/business` — 전역 하단 탭 숨김. `/stores/owner` 대시보드만 탭 표시·하위는 `resolveConditionalAppShellFlags`.
    (pathname?.startsWith("/mypage/business") ?? false) ||
    (pathname?.startsWith("/my/business") ?? false);

  const effectiveOuterExtra = extraOuterClassName;

  const outerClass = [
    BOTTOM_NAV_SHELL.outerClassName,
    bodyPortal || effectiveOuterExtra.length > 0 ? BOTTOM_NAV_OUTER_MOTION : "",
    effectiveOuterExtra,
  ]
    .filter(Boolean)
    .join(" ");

  const renderBottomNavTab = useCallback(
    (tab: BottomNavItemConfig, _tabIndex: number) => {
      const groupEdgeClass = "";
      const guardNav = () => {
        const targetHref =
          tab.id === "chat" ||
          tab.id === "delivery-order-chat" ||
          tab.id === "philife-messenger" ||
          tab.id === "trade-order-chat"
            ? bottomNavMessengerHrefWithOrigin(tab.href, pathname, searchParams)
            : tab.id === "delivery-orders"
              ? resolveDeliveryOrderHistoryHref(ownerStoreRow?.id)
              : tab.href;
        if (!guardBeforeNavigate(targetHref)) return false;
        if (!targetHref.includes("/community-messenger")) return true;
        const user = getCurrentUser();
        if (!user?.id) return true;
        if (clientHasVerifiedContactForInteractive(user)) return true;
        openPhoneVerificationRequiredDialog({ next: targetHref });
        return false;
      };
      const closeSwitcherOnNav = undefined;

      if (tab.id === "delivery-cart") {
        return (
          <BottomNavTabDeliveryCart
            key={tab.id}
            tab={tab}
            itemClassName={groupEdgeClass}
            pathname={pathname}
            navSearch={navSearch}
            pendingActiveTabId={pendingActiveTabId}
            onNavigationIntent={markBottomNavIntent}
            beginMenuNavigation={beginBottomNavNavigation}
            guardBeforeNavigate={guardNav}
            onCloseDomainSwitcher={closeSwitcherOnNav}
          />
        );
      }
      if (tab.icon === "stores" && !usesDeliveryHubShell) {
        return (
          <BottomNavTabStores
            key={tab.id}
            tab={tab}
            itemClassName={groupEdgeClass}
            pathname={pathname}
            navSearch={navSearch}
            pendingActiveTabId={pendingActiveTabId}
            onNavigationIntent={markBottomNavIntent}
            beginMenuNavigation={beginBottomNavNavigation}
            guardBeforeNavigate={guardNav}
            onCloseDomainSwitcher={closeSwitcherOnNav}
          />
        );
      }
      return (
        <BottomNavTabStandard
          key={tab.id}
          tab={tab}
          itemClassName={groupEdgeClass}
          pathname={pathname}
          navSearch={navSearch}
          pendingActiveTabId={pendingActiveTabId}
          onNavigationIntent={markBottomNavIntent}
          beginMenuNavigation={beginBottomNavNavigation}
          guardBeforeNavigate={guardNav}
          onCloseDomainSwitcher={closeSwitcherOnNav}
        />
      );
    },
    [
      pathname,
      navSearch,
      searchParams,
      ownerStoreRow?.id,
      pendingActiveTabId,
      markBottomNavIntent,
      beginBottomNavNavigation,
      guardBeforeNavigate,
      usesDeliveryHubShell,
    ]
  );

  const nav = (
    <nav
      className={[
        outerClass,
        usesDeliveryHubShell ? "app-bottom-nav-shell--delivery" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("nav_bottom_bar_aria")}
    >
      <div className={BOTTOM_NAV_SHELL.innerBarClassName}>
        <div
          className={BOTTOM_NAV_SHELL.containerClassName}
          data-tab-count={displayTabs.length}
        >
          {displayTabs.map((tab, index) => renderBottomNavTab(tab, index))}
        </div>
      </div>
    </nav>
  );

  if (hideBottomNavShell) return null;

  if (bodyPortal && portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }

  return nav;
}

