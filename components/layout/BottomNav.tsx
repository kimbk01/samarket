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
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";
import { prewarmBottomNavTapHrefResolvingStoresRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import { commitMainBottomNavRoute, mainBottomNavRouteUsesReplace } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { openBottomNavHref } from "@/lib/main-menu/bottom-nav-link-open";
import { isCommunityMessengerRoomPathname } from "@/lib/layout/conditional-app-shell-flags";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import { isBottomNavTabActive } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
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
import { markBottomNavRouteIntentForBackgroundWarm } from "@/lib/navigation/mark-bottom-nav-route-intent";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
import { MAIN_BOTTOM_NAV_TAB_ICONS, MainBottomNavHomeIcon } from "@/components/main-menu/MainBottomNavTabIcons";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { isMainBottomNavUnifiedInboxTabId } from "@/lib/community-messenger/messenger-entry-origin";
import { dismissLoginRequiredSheet, requireAuthAction } from "@/lib/auth/require-auth-action";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { probeMainBottomNavRiskyNavigation } from "@/lib/navigation/main-bottom-nav-risky-navigation";
import { usePhilifeWriteSheetOptional } from "@/contexts/PhilifeWriteSheetContext";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { shouldDeferUnreadBadgeRepaint } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { useRegion, useRegionOptional } from "@/contexts/RegionContext";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";
import {
  resolveMainBottomNavHubDomain,
} from "@/lib/main-menu/main-bottom-nav-domain";
import {
  resolveMainBottomNavTabEmphasisKind,
  resolveMainBottomNavTabTapHref,
  type MainBottomNavTabEmphasisKind,
} from "@/lib/main-menu/main-bottom-nav-tab-emphasis";
import { resolveBottomNavTransitionConfirmCopy } from "@/lib/navigation/main-bottom-nav-transition-copy";
import {
  MainBottomNavDomainTransitionDialog,
  useMainBottomNavDomainTransition,
} from "@/lib/navigation/main-bottom-nav-domain-transition-dialog";
import { isSamarketNavPerfConsoleEnabled } from "@/lib/debug/samarket-client-console-flags";

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

export type BottomNavTabCommitOpts = {
  pathname: string | null;
  navSearch: string;
  href: string;
  tabId: string;
  isActive: boolean;
  /** 확인 모달 노출 시점에 prewarm을 선행했다면 true */
  prewarmedBeforeCommit?: boolean;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  onNavigationIntent: (tabId: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  router: Pick<ReturnType<typeof useRouter>, "prefetch" | "push" | "replace">;
  onPrewarm?: () => void;
  onCloseDomainSwitcher?: () => void;
};

/** 하단 탭 이동 — `commitMainBottomNavRoute` 단일 경로 */
export function commitBottomNavTabRoute(opts: BottomNavTabCommitOpts): void {
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
    prefetch: () => {
      /* RSC prefetch 금지 — 클라 prewarm 만 `onPrewarm` 경로 */
    },
    onPrewarm: opts.onPrewarm,
    skipPostCommitPrewarm: opts.prewarmedBeforeCommit === true,
    onCloseDomainSwitcher: opts.onCloseDomainSwitcher,
    persistMessengerOriginFromHref: isMainBottomNavUnifiedInboxTabId(opts.tabId),
  });
}

function runBottomNavTabClickOrOpenNew(
  e: BottomNavActivateEvent,
  tab: BottomNavItemConfig,
  href: string,
  opts: Omit<BottomNavTabCommitOpts, "href" | "tabId">,
  commitTabRouteWithConfirm: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void
): void {
  if (tab.openInNewTab) {
    e.preventDefault();
    openBottomNavHref(href, true);
    return;
  }
  e.preventDefault();
  commitTabRouteWithConfirm(tab.id, { ...opts, href, tabId: tab.id });
}

function bottomNavOrbitEmphasisItemClass(emphasisKind: MainBottomNavTabEmphasisKind): string {
  if (emphasisKind === "domain-hub") return "app-bottom-nav-item--domain-hub";
  if (emphasisKind === "messenger-hub") return "app-bottom-nav-item--messenger-hub";
  return "";
}

function BottomNavTabIconContent({
  tab,
  isActive,
  emphasisKind,
  iconSize,
  badgeCount,
}: {
  tab: BottomNavItemConfig;
  isActive: boolean;
  emphasisKind: MainBottomNavTabEmphasisKind;
  iconSize: string;
  badgeCount: number;
}) {
  if (emphasisKind === "domain-hub" || emphasisKind === "messenger-hub") {
    return (
      <>
        <div className="app-bottom-nav-icon-slot" aria-hidden="true">
          <span className="block h-[22px] w-[22px] shrink-0" />
        </div>
        <div className="app-bottom-nav-icon-slot app-bottom-nav-icon-slot--domain-hub-orbit">
          <span
            className={[
              "app-bottom-nav-domain-hub-orbit",
              isActive ? "app-bottom-nav-domain-hub-orbit--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="app-bottom-nav-domain-hub-orbit-icon-wrap" aria-hidden>
              <MainBottomNavHomeIcon className="app-bottom-nav-domain-hub-icon" />
            </span>
            <BottomNavHubBadgeDot count={badgeCount} />
          </span>
        </div>
      </>
    );
  }
  return (
    <div className="app-bottom-nav-icon-slot">
      <span className="app-bottom-nav-inline-icon" key={isActive ? "on" : "off"}>
        <MainBottomNavTabIcon tab={tab} className={iconSize} />
        <BottomNavHubBadgeDot count={badgeCount} />
      </span>
    </div>
  );
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
  emphasisKind = null,
  commitTabRouteWithConfirm,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  /** 탭 이동 직후 — pathname 갱신 전에도 **한 탭만** 활성으로 보이게 함(이전 경로 탭이 남는 체감 제거) */
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  emphasisKind?: MainBottomNavTabEmphasisKind;
  commitTabRouteWithConfirm: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
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

  const effectiveHref = useMemo(
    () =>
      resolveMainBottomNavTabTapHref(tab.id, tab.href, {
        emphasisKind,
        pathname,
        searchParams,
        ownerStoreId: ownerStore?.id,
      }),
    [tab.id, tab.href, pathname, searchParams, ownerStore?.id, emphasisKind]
  );

  const className = [
    "app-bottom-nav-item group",
    bottomNavOrbitEmphasisItemClass(emphasisKind),
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
      <BottomNavTabIconContent
        tab={tab}
        isActive={isActive}
        emphasisKind={emphasisKind}
        iconSize={iconSize}
        badgeCount={tabBadgeCount}
      />
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
      prefetch={false}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, effectiveHref)}
      scroll={false}
      className={className}
      data-bottom-nav-tab-id={tab.id}
      data-active={isActive ? "true" : "false"}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => {
        if (!isActive) {
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
            prewarmBottomNavTapTargetClientCache(effectiveHref);
          } catch {
            /* noop */
          }
        }
      }}
      onTouchStart={() => {
        if (!isActive) {
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
        if (!guardBeforeNavigate(effectiveHref)) {
          e.preventDefault();
          return;
        }
        runBottomNavTabClickOrOpenNew(
          e,
          tab,
          effectiveHref,
          {
            pathname,
            navSearch,
            isActive,
            beginMenuNavigation,
            onNavigationIntent,
            guardBeforeNavigate,
            router,
            onCloseDomainSwitcher,
          },
          commitTabRouteWithConfirm
        );
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
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
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
      data-bottom-nav-tab-id={tab.id}
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
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
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
  commitTabRouteWithConfirm,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  commitTabRouteWithConfirm: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
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
      prefetch={false}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, effectiveHref)}
      scroll={false}
      className={className}
      data-bottom-nav-tab-id={tab.id}
      data-active={isActive ? "true" : "false"}
      aria-label={tabLabel}
      aria-current={isActive ? "page" : undefined}
      onPointerDown={(e) => triggerLightTapFeedback(e)}
      onClick={(e) => {
        if (!guardBeforeNavigate(effectiveHref)) {
          e.preventDefault();
          return;
        }
        runBottomNavTabClickOrOpenNew(
          e,
          tab,
          effectiveHref,
          {
            pathname,
            navSearch,
            isActive,
            beginMenuNavigation,
            onNavigationIntent,
            guardBeforeNavigate,
            router,
            onCloseDomainSwitcher,
          },
          commitTabRouteWithConfirm
        );
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
  emphasisKind = null,
  commitTabRouteWithConfirm,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  emphasisKind?: MainBottomNavTabEmphasisKind;
  commitTabRouteWithConfirm: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
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
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const storesTabHref = useMemo(
    () =>
      resolveMainBottomNavTabTapHref(tab.id, tab.href, {
        emphasisKind,
        pathname,
      }),
    [emphasisKind, tab.href, tab.id, pathname]
  );
  const storesTabOwnerLite = !!ownerStore;
  const prewarmStoresTabClientCache = useCallback(() => {
    prewarmBottomNavTapHrefResolvingStoresRegion(storesTabHref, primaryRegion);
  }, [primaryRegion, storesTabHref]);

  const inactiveSurface =
    isActive || !storesTabOwnerLite
      ? ""
      : "bg-transparent";
  const className = [
    "app-bottom-nav-item group",
    bottomNavOrbitEmphasisItemClass(emphasisKind),
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
      <BottomNavTabIconContent
        tab={tab}
        isActive={isActive}
        emphasisKind={emphasisKind}
        iconSize={iconSize}
        badgeCount={tabBadgeCount}
      />
      <span
        className={`app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`}
        suppressHydrationWarning
      >
        {tabLabel}
      </span>
    </>
  );

  return (
    <Link
      href={storesTabHref}
      prefetch={false}
      replace={mainBottomNavRouteUsesReplace(pathname ?? null, storesTabHref)}
      scroll={false}
      className={className}
      data-bottom-nav-tab-id={tab.id}
      data-active={isActive ? "true" : "false"}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => {
        if (!isActive) {
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
            prewarmStoresTabClientCache();
          } catch {
            /* noop */
          }
        }
      }}
      onTouchStart={() => {
        if (!isActive) {
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
        if (!guardBeforeNavigate(storesTabHref)) {
          e.preventDefault();
          return;
        }
        runBottomNavTabClickOrOpenNew(
          e,
          tab,
          storesTabHref,
          {
            pathname,
            navSearch,
            isActive,
            beginMenuNavigation,
            onNavigationIntent,
            guardBeforeNavigate,
            router,
            onPrewarm: prewarmStoresTabClientCache,
            onCloseDomainSwitcher,
          },
          commitTabRouteWithConfirm
        );
      }}
    >
      {inner}
    </Link>
  );
});

const TAB_ICONS = MAIN_BOTTOM_NAV_TAB_ICONS;

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
  const { primaryRegion } = useRegion();
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();
  const bottomNavPickCtxRef = useRef<{ searchParams: typeof searchParams; ownerStoreId?: string | null }>({
    searchParams,
    ownerStoreId: null,
  });
  const router = useRouter();
  const { beginMenuNavigation } = useLatestMenuNavigation();
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
    (href: string, source?: MenuNavigationSource, options?: BeginMenuNavigationOptions) => {
      dismissLoginRequiredSheet();
      beginMenuNavigation(href, source ?? "bottom-nav", options);
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

  const [portalToBody, setPortalToBody] = useState(false);
  const confirmIntentStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (bodyPortal) setPortalToBody(true);
  }, [bodyPortal]);

  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const philifeWriteSheet = usePhilifeWriteSheetOptional();
  const bottomNavRiskyNavigationState = useMemo(
    () =>
      probeMainBottomNavRiskyNavigation({
        tradeWriteOpen: tradeWriteSheet?.isOpen,
        tradeWriteBlocking: tradeWriteSheet?.blockingDraft,
        philifeWriteOpen: philifeWriteSheet?.isOpen,
        philifeWriteBlocking: philifeWriteSheet?.blockingDraft,
      }),
    [
      tradeWriteSheet?.isOpen,
      tradeWriteSheet?.blockingDraft,
      philifeWriteSheet?.isOpen,
      philifeWriteSheet?.blockingDraft,
    ]
  );
  const { t } = useI18n();
  const hubDomain = useMemo(() => resolveMainBottomNavHubDomain(pathname ?? null), [pathname]);
  const {
    pendingTransition,
    requestTransition,
    confirmTransition,
    cancelTransition,
  } = useMainBottomNavDomainTransition(pathname ?? null);

  const commitTabRouteWithConfirm = useCallback(
    (tabId: string, commitOpts: BottomNavTabCommitOpts) => {
      const copy = resolveBottomNavTransitionConfirmCopy(
        pathname ?? null,
        tabId,
        bottomNavRiskyNavigationState
      );
      if (copy != null) {
        /**
         * 확인 모달 노출 시점부터 목적지 prewarm을 선행해,
         * 확인 클릭 직후 route commit 체감 지연을 줄인다.
         * (탭 이동은 여전히 confirmTransition 이후에만 수행)
         */
        try {
          if (commitOpts.onPrewarm) {
            commitOpts.onPrewarm();
          } else {
            prewarmBottomNavTapTargetClientCache(commitOpts.href, { source: "route_commit" });
          }
        } catch {
          /* noop */
        }
      }
      if (copy != null) {
        confirmIntentStartRef.current = performance.now();
      } else {
        confirmIntentStartRef.current = null;
      }
      requestTransition(copy, () => {
        commitBottomNavTabRoute({
          ...commitOpts,
          prewarmedBeforeCommit: copy != null || commitOpts.prewarmedBeforeCommit === true,
        });
      });
    },
    [pathname, requestTransition, bottomNavRiskyNavigationState]
  );

  const confirmTransitionWithPerf = useCallback(() => {
    const t0 = confirmIntentStartRef.current;
    confirmIntentStartRef.current = null;
    if (t0 != null && isSamarketNavPerfConsoleEnabled()) {
      const ms = Math.round(performance.now() - t0);
      if (typeof window !== "undefined") {
        const w = window as Window & {
          __SAMARKET_CONFIRM_NAV_EVENTS?: Array<{ at: number; confirm_to_commit_ms: number }>;
        };
        if (!Array.isArray(w.__SAMARKET_CONFIRM_NAV_EVENTS)) {
          w.__SAMARKET_CONFIRM_NAV_EVENTS = [];
        }
        w.__SAMARKET_CONFIRM_NAV_EVENTS.push({ at: Date.now(), confirm_to_commit_ms: ms });
      }
      console.debug("[nav-perf]", { phase: "confirm_to_commit", ms });
    }
    confirmTransition();
  }, [confirmTransition]);

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
      const pendingChatNav =
        pendingActiveTabId != null && isMainBottomNavUnifiedInboxTabId(pendingActiveTabId);
      const emphasisKind = resolveMainBottomNavTabEmphasisKind(tab.id, pathname, {
        hubDomain,
        pendingChatNav: pendingChatNav && tab.id === pendingActiveTabId,
      });
      const guardNav = () => {
        dismissLoginRequiredSheet();
        const targetHref = resolveMainBottomNavTabTapHref(tab.id, tab.href, {
          emphasisKind,
          pathname,
          searchParams,
          ownerStoreId: ownerStoreRow?.id,
        });
        if (!guardBeforeNavigate(targetHref)) return false;
        if (!targetHref.includes("/community-messenger")) return true;
        void requireAuthAction(
          "messenger_open",
          () => {
            router.push(targetHref);
          },
          { next: targetHref },
        );
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
            commitTabRouteWithConfirm={commitTabRouteWithConfirm}
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
            emphasisKind={emphasisKind}
            commitTabRouteWithConfirm={commitTabRouteWithConfirm}
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
          emphasisKind={emphasisKind}
          commitTabRouteWithConfirm={commitTabRouteWithConfirm}
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
      router,
      usesDeliveryHubShell,
      hubDomain,
      commitTabRouteWithConfirm,
    ]
  );

  const nav = (
    <>
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
      <MainBottomNavDomainTransitionDialog
        pending={pendingTransition}
        onCancel={cancelTransition}
        onConfirm={confirmTransitionWithPerf}
      />
    </>
  );

  if (hideBottomNavShell) return null;

  if (bodyPortal && portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }

  return nav;
}

