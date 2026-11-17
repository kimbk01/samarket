"use client";

import { BottomNavProfileAvatar } from "@/components/layout/BottomNavProfileAvatar";
import { useBottomNavChatBadgeWithLastRunSeed } from "@/components/layout/use-bottom-nav-chat-badge-seed";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOTTOM_NAV_OUTER_MOTION,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_SIDE_RAIL_CLASS,
  BOTTOM_NAV_SIDE_RAIL_KEYBOARD_HOLD_CLASS,
  BOTTOM_NAV_THEME,
  bottomNavUsesDeliveryHubShell,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  useOwnerHubBadgeStoreDeepLink,
  useOwnerHubBadgeTabUnreadCount,
} from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerNavigationSummary } from "@/lib/delivery/owner/projections/use-owner-navigation-summary";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";
import { prewarmBottomNavTapHrefResolvingStoresRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import { commitMainBottomNavRoute, shouldMainBottomNavRouteScrollOnly } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import { openBottomNavHref } from "@/lib/main-menu/bottom-nav-link-open";
import {
  maybeApkPrefetchBottomNavRoute,
  shouldRunApkBottomNavRoutePrefetch,
} from "@/lib/platform/apk-remote-webview-perf";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import {
  composeMainBottomNavDisplayTabs,
  resolveMainBottomNavSecondaryRailKind,
} from "@/lib/main-menu/main-bottom-nav-split-layout";
import {
  DELIVERY_BOTTOM_NAV_LABEL_CLASS,
  isDeliveryBottomNavTabId,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
import {
  isPhilifeBottomNavTabId,
  PHILIFE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/main-menu/philife-bottom-nav-layout";
import {
  isTradeBottomNavTabId,
  TRADE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/main-menu/trade-bottom-nav-layout";
import { syncMypageBottomNavContextFromPath } from "@/lib/main-menu/mypage-bottom-nav-origin";
import { markBottomNavRouteIntentForBackgroundWarm } from "@/lib/navigation/mark-bottom-nav-route-intent";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
import { MAIN_BOTTOM_NAV_TAB_ICONS } from "@/components/main-menu/MainBottomNavTabIcons";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { useShellHydrated } from "@/lib/ui/use-shell-hydrated";
import { isMainBottomNavUnifiedInboxTabId } from "@/lib/community-messenger/messenger-entry-origin";
import {
  dismissLoginRequiredSheet,
  enforceAuthGatesAfterDeferredNavigation,
  requireAuthAction,
} from "@/lib/auth/require-auth-action";
import { getSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isRecoveringPhase } from "@/lib/auth/dibay-session-policy";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isClientSignupComplete } from "@/lib/auth/client-signup-gate";
import { peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { computeMainBottomNavPushAxis } from "@/lib/navigation/compute-main-bottom-nav-push-axis";
import { setMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { pathFromHref } from "@/lib/navigation/main-shell-push-session";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import type {
  BeginMenuNavigationOptions,
  MenuNavigationSource,
} from "@/contexts/LatestMenuNavigationContext";
import { shouldDeferUnreadBadgeRepaint } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { useRegion } from "@/contexts/RegionContext";
import { prewarmBottomNavHaptics, triggerBottomNavSelectionFeedback } from "@/lib/ui/light-tap-feedback";
import {
  beginBottomNavShowing,
  failBottomNavShowing,
} from "@/lib/main-menu/bottom-nav-controller";
import { useBottomNavResumeUiTask } from "@/lib/main-menu/use-bottom-nav-resume-ui-task";
import { useBottomNavShowingTarget } from "@/lib/main-menu/use-bottom-nav-controller";
import {
  resolveMainBottomNavHubDomain,
} from "@/lib/main-menu/main-bottom-nav-domain";
import {
  resolveMainBottomNavTabEmphasisKind,
  resolveMainBottomNavTabTapHref,
  type MainBottomNavTabEmphasisKind,
} from "@/lib/main-menu/main-bottom-nav-tab-emphasis";
import { shouldPrefetchMainBottomNavHref } from "@/lib/main-menu/main-bottom-nav-link-prefetch-eligibility";
import { useHtmlShellFlagsSync } from "@/lib/layout/use-html-shell-flags-sync";

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";


/**
 * 하단 탭 배지 — 링 색 1개(하단 바 바탕색). 공용 배지의 `ring-white` 와 다른 링 클래스가 함께 붙어
 * CSS 순서에 따라 색이 바뀌던 것을 정리 (크롬 S4 B-07, 2026-11-02).
 */
const BOTTOM_NAV_HUB_BADGE_CLASS = `bottom-nav-hub-badge ${OWNER_HUB_BADGE_DOT_CLASS.replace(
  " ring-white",
  ""
)} ring-[color:var(--app-bottom-nav-surface)]`;

const BottomNavHubBadgeDot = memo(function BottomNavHubBadgeDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={BOTTOM_NAV_HUB_BADGE_CLASS}>
      {count > 99 ? "99+" : count}
    </span>
  );
});

type BottomNavActivateEvent = Pick<MouseEvent<HTMLAnchorElement>, "preventDefault">;

function warmBottomNavTabIntent(
  href: string,
  opts: { router?: Pick<ReturnType<typeof useRouter>, "prefetch">; isActive?: boolean } = {},
): void {
  try {
    prewarmBottomNavTapTargetClientCache(href);
  } catch {
    /* noop */
  }
  if (opts.router) {
    maybeApkPrefetchBottomNavRoute(
      (h) => {
        void opts.router!.prefetch(h);
      },
      href,
      opts.isActive ?? false,
    );
  }
}

export type BottomNavTabCommitOpts = {
  /** 로그인 확인 등 기다림 뒤 실행 — 그 사이 시작된 방·통화 진입 잠금이 이긴다 */
  deferredAfterAwait?: boolean;
  pathname: string | null;
  navSearch: string;
  href: string;
  tabId: string;
  isActive: boolean;
  /** Chat auth gate 등에서 이미 prewarm 했으면 true */
  prewarmedBeforeCommit?: boolean;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => { id: number } | void;
  onNavigationIntent: (tabId: string) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  router: Pick<ReturnType<typeof useRouter>, "prefetch" | "push" | "replace">;
  onPrewarm?: () => void;
  onCloseDomainSwitcher?: () => void;
  /** 탭 클릭 진입점에서 `guardBeforeNavigate` 를 이미 통과했으면 true — 커밋에서 두 번 묻지 않는다 */
  guardPassed?: boolean;
};

/** 하단 탭 이동 — `commitMainBottomNavRoute` 단일 경로 */
export function commitBottomNavTabRoute(opts: BottomNavTabCommitOpts): "scroll_only" | "blocked" | "navigated" {
  return commitMainBottomNavRoute({
    pathname: opts.pathname,
    currentSearch: opts.navSearch,
    href: opts.href,
    tabId: opts.tabId,
    prefetchWhenInactive: !opts.isActive,
    beginMenuNavigation: opts.beginMenuNavigation,
    onNavigationIntent: opts.onNavigationIntent,
    guardBeforeNavigate: opts.guardBeforeNavigate,
    guardPassed: opts.guardPassed === true,
    replace: (href) => opts.router.replace(href),
    prefetch: shouldRunApkBottomNavRoutePrefetch()
      ? (href) => {
          void opts.router.prefetch(href);
        }
      : undefined,
    onPrewarm: opts.onPrewarm,
    skipPostCommitPrewarm: opts.prewarmedBeforeCommit === true,
    onCloseDomainSwitcher: opts.onCloseDomainSwitcher,
    persistMessengerOriginFromHref: isMainBottomNavUnifiedInboxTabId(opts.tabId),
    showOnBottomNavController: true,
    deferredAfterAwait: opts.deferredAfterAwait === true,
  });
}

function runBottomNavTabClickOrOpenNew(
  e: BottomNavActivateEvent,
  tab: BottomNavItemConfig,
  href: string,
  opts: Omit<BottomNavTabCommitOpts, "href" | "tabId">,
  commitTabRoute: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void
): void {
  if (tab.openInNewTab) {
    e.preventDefault();
    openBottomNavHref(href, true);
    return;
  }
  e.preventDefault();
  /** 글쓰기 시트 이탈 확인은 여기 1회 — 커밋(`commitMainBottomNavRoute`)은 다시 묻지 않는다 */
  if (!opts.guardBeforeNavigate(href)) return;
  commitTabRoute(tab.id, { ...opts, href, tabId: tab.id, guardPassed: true });
}

function BottomNavTabIconContent({
  tab,
  isActive,
  iconSize,
  badgeCount,
}: {
  tab: BottomNavItemConfig;
  isActive: boolean;
  iconSize: string;
  badgeCount: number;
}) {
  /**
   * 하단 탭 아이콘 (계약 v2 · Owner 2026-11-15 「네이버형 채움↔외곽선」): 서비스 탭 = 선택 채움 · 비선택 외곽선 26px,
   * 색은 선택 DIBAY 그린 · 비선택 회색(CSS). 바뀌는 순간 애니메이션 없음. 「MY」는 내 프로필 사진(선택 = 테두리).
   */
  if (tab.id === "my") {
    return (
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon app-bottom-nav-inline-icon--avatar">
          <BottomNavProfileAvatar />
          <BottomNavHubBadgeDot count={badgeCount} />
        </span>
      </div>
    );
  }
  return (
    <div className="app-bottom-nav-icon-slot">
      <span className="app-bottom-nav-inline-icon">
        <MainBottomNavTabIcon tab={tab} className={iconSize} selected={isActive} />
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
  showingTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
  emphasisKind = null,
  commitTabRoute,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  /** 하단 탭 컨트롤러가 이동 중인 탭 — 경로 확정 전에도 **누른 탭 하나만** 선택으로 보인다 */
  showingTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  emphasisKind?: MainBottomNavTabEmphasisKind;
  commitTabRoute: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
}) {
  const { tt, t, safeT } = useI18n();
  const router = useRouter();
  const liveTabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  /** 앱 진입 실기 F3-a — telRING 탭은 진짜 값 전까지 지난 실행 숫자 */
  const tabBadgeCount = useBottomNavChatBadgeWithLastRunSeed(tab.icon, liveTabBadgeCount);
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const ownerNav = useOwnerNavigationSummary();
  const searchParams = useSearchParams();
  /**
   * C3 (Owner 승인 2026-11-10): 레일 판정·탭 주소는 브라우저 저장값(sessionStorage)을 읽는다 →
   * 서버 HTML·hydration 첫 렌더는 저장값 없이(기본 주소), hydration 직후 저장값 반영 (React 19 는 속성 불일치를 고치지 않음).
   */
  const shellHydrated = useShellHydrated();
  const secondaryRail = useMemo(
    () => (shellHydrated ? resolveMainBottomNavSecondaryRailKind(pathname, searchParams) : undefined),
    [pathname, searchParams, shellHydrated]
  );
  const isActive =
    showingTabId != null
      ? tab.id === showingTabId
      : isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const effectiveHref = useMemo(
    () =>
      shellHydrated
        ? resolveMainBottomNavTabTapHref(tab.id, tab.href, {
            emphasisKind,
            pathname,
            searchParams,
            ownerStoreId: ownerNav.storeId,
          })
        : tab.href,
    [tab.id, tab.href, pathname, searchParams, ownerNav.storeId, emphasisKind, shellHydrated]
  );

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
      <BottomNavTabIconContent
        tab={tab}
        isActive={isActive}
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
      prefetch={shouldPrefetchMainBottomNavHref(effectiveHref, isActive)}
      replace
      scroll={false}
      className={className}
      data-bottom-nav-tab-id={tab.id}
      data-active={isActive ? "true" : "false"}
      aria-label={ariaLbl}
      aria-current={isActive ? "page" : undefined}
      onPointerEnter={() => {
        if (!isActive) warmBottomNavTabIntent(effectiveHref, { router, isActive });
      }}
      onFocus={() => {
        if (!isActive) warmBottomNavTabIntent(effectiveHref, { router, isActive });
      }}
      onTouchStart={() => {
        if (!isActive) warmBottomNavTabIntent(effectiveHref, { router, isActive });
      }}
      onPointerDown={() => {
        /**
         * 손을 대는 순간은 「준비」만 — 선택·햅틱·이동은 손을 뗄 때(click) 1회 (계약 v2 · Owner 2026-11-15 「너무 빨라도 안 됨」).
         * 바 위에서 시작한 스크롤은 click 이 오지 않아 선택되지 않는다.
         */
        if (!isActive) {
          markBottomNavRouteIntentForBackgroundWarm();
          warmBottomNavTabIntent(effectiveHref, { router, isActive });
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Enter") return;
        if (e.key !== " ") return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      onClick={(e) => {
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
          commitTabRoute
        );
      }}
    >
      {inner}
    </Link>
  );
});

const BottomNavTabDeliveryCart = memo(function BottomNavTabDeliveryCart({
  tab,
  itemClassName = "",
  pathname,
  navSearch,
  showingTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
  commitTabRoute,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  showingTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  commitTabRoute: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
}) {
  const { tt, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** C3 — 위와 같음: 저장값 레일 판정은 hydration 이후 */
  const shellHydrated = useShellHydrated();
  const secondaryRail = useMemo(
    () => (shellHydrated ? resolveMainBottomNavSecondaryRailKind(pathname, searchParams) : undefined),
    [pathname, searchParams, shellHydrated]
  );
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const { href: effectiveHref } = useCommerceCartNavHref(tab.href);
  const isActive =
    showingTabId != null
      ? tab.id === showingTabId
      : isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
  const Icon = TAB_ICONS.cart;
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;
  const className = ["app-bottom-nav-item group", BOTTOM_NAV_ITEM_TOUCH_CLASS, itemClassName].filter(Boolean).join(" ");

  return (
    <Link
      href={effectiveHref}
      prefetch={shouldPrefetchMainBottomNavHref(effectiveHref, isActive)}
      replace
      scroll={false}
      className={className}
      data-bottom-nav-tab-id={tab.id}
      data-active={isActive ? "true" : "false"}
      aria-label={tabLabel}
      aria-current={isActive ? "page" : undefined}
      onClick={(e) => {
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
          commitTabRoute
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
  showingTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
  onCloseDomainSwitcher,
  emphasisKind = null,
  commitTabRoute,
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  navSearch: string;
  showingTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: (
    href: string,
    source?: MenuNavigationSource,
    options?: BeginMenuNavigationOptions
  ) => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onCloseDomainSwitcher?: () => void;
  emphasisKind?: MainBottomNavTabEmphasisKind;
  commitTabRoute: (tabId: string, commitOpts: BottomNavTabCommitOpts) => void;
}) {
  const { tt, t, safeT } = useI18n();
  const router = useRouter();
  const ownerNav = useOwnerNavigationSummary();
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const { primaryRegion } = useRegion();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount("stores");
  const _storeDeepLink = useOwnerHubBadgeStoreDeepLink();
  const isActive =
    showingTabId != null
      ? tab.id === showingTabId
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
  const storesTabOwnerLite = ownerNav.hasPreferredStore;
  const prewarmStoresTabClientCache = useCallback(() => {
    prewarmBottomNavTapHrefResolvingStoresRegion(storesTabHref, primaryRegion);
  }, [primaryRegion, storesTabHref]);

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
      : storesTabOwnerLite && ownerNav.storeName
        ? t("nav_store_owner", { label: tabLabel, storeName: ownerNav.storeName })
        : undefined;

  const inner = (
    <>
      <BottomNavTabIconContent
        tab={tab}
        isActive={isActive}
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
      prefetch={shouldPrefetchMainBottomNavHref(storesTabHref, isActive)}
      replace
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
      onPointerDown={() => {
        /** 손을 대는 순간은 준비만 — 선택·햅틱·이동은 click (계약 v2) */
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
          commitTabRoute
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
  inert = false,
  presentation = "bottom",
  presentationEnter = null,
  sideRailKeyboardHoldHeightPx = null,
}: {
  /**
   * SSR hydrate 호환을 위해 시그니처 유지 — 실제 탭 단일 소스는
   * `MainBottomNavTabsProvider` 가 `(main)/layout.tsx` 의 동일한 server payload 로 mount 된다.
   */
  initialTabs?: BottomNavItemConfig[] | null;
  /** `transform` 이 걸린 조상 밖(뷰포트 `fixed`) — 필라이프 헤더 메신저 슬라이드 스택 */
  bodyPortal?: boolean;
  extraOuterClassName?: string;
  /** Keyboard-hide (translated off-screen) — remove from focus order / hit-testing. */
  inert?: boolean;
  /**
   * `side-rail` — 데스크톱(DESKTOP 계열) 왼쪽 세로 레일. 탭·이동·배지·로그인 처리 로직은 같고 배치만 CSS 로 바꾼다
   * (`app/app-desktop-side-nav.css`). 셸 판정은 `resolveAppShell().navigationPresentation` 단일 정의.
   */
  presentation?: "bottom" | "side-rail";
  /** v5 — 회전으로 메뉴 형태가 막 바뀐 순간(280ms) 들어오는 방향. `useNavPresentationSwitchMotion` */
  presentationEnter?: "bottom" | "rail" | null;
  /**
   * v6 R2-3 — Android 키보드가 웹뷰 높이를 줄인 동안 세로 메뉴 높이를 「키보드 열기 전 창 높이」로 고정한다
   * (줄어든 높이에 다시 가운데 정렬되어 아래 항목이 잘리지 않게 — 키보드가 아래 항목을 덮는다). null = 고정 안 함.
   */
  sideRailKeyboardHoldHeightPx?: number | null;
}) {
  void initialTabs;
  if (!shouldDeferUnreadBadgeRepaint()) {
    bumpMessengerRenderPerf("messenger_bottom_nav_render");
  }
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();

  /** `/mypage` 레일 — 직전 배달·거래·커뮤니티 셸을 sessionStorage 로 복원 */
  useEffect(() => {
    syncMypageBottomNavContextFromPath(pathname, navSearch);
  }, [pathname, navSearch]);
  const bottomNavPickCtxRef = useRef<{ searchParams: typeof searchParams; ownerStoreId?: string | null }>({
    searchParams,
    ownerStoreId: null,
  });
  const { beginMenuNavigation } = useLatestMenuNavigation();
  /**
   * 탭 단일 소스: `MainBottomNavTabsProvider`. admin 변경·storage 동기화·관리자 이탈 강제 재조회는
   * 해당 Provider 가 담당하므로 여기서는 읽기만. (`initialTabs` prop 은 SSR hydrate 호환을 위해 시그니처 유지.)
   */
  const tabs = useMainBottomNavTabs();
  const ownerNav = useOwnerNavigationSummary();
  const displayTabs = useMemo(
    () => composeMainBottomNavDisplayTabs(pathname ?? null, tabs, searchParams, ownerNav.storeId),
    [pathname, tabs, searchParams, ownerNav.storeId]
  );
  const usesDeliveryHubShell = useMemo(
    () => bottomNavUsesDeliveryHubShell(displayTabs),
    [displayTabs]
  );
  useLayoutEffect(() => {
    bottomNavPickCtxRef.current = { searchParams, ownerStoreId: ownerNav.storeId };
  }, [searchParams, ownerNav.storeId]);
  /**
   * 선택 표시 단일 결정권자 = 하단 탭 컨트롤러(`bottom-nav-controller`) — 손 뗀 순간부터 경로 확정·거부·감시 전환까지
   * 누른 탭 하나만 선택으로 보인다. 예전 `pendingActiveTabId`·1.5초 타이머·진행 막대는 지웠다(계약 v2).
   */
  const showing = useBottomNavShowingTarget();
  const showingTabId = showing?.tabId ?? null;
  /** 네이티브 선택 햅틱 모듈 미리 불러 두기(S4) — 첫 탭부터 네이티브 햅틱 */
  useEffect(() => {
    prewarmBottomNavHaptics();
  }, []);

  /** 앱 복귀 즉시 하단 탭 상태 재정렬 — 사장님 하단 탭과 같은 작업(`use-bottom-nav-resume-ui-task`) */
  useBottomNavResumeUiTask();
  /** 컨트롤러가 이미 선택을 정하므로 메뉴 의도 알림은 받지 않는다(호출처 호환용 no-op) */
  const markBottomNavIntent = useCallback((_tabId: string) => {}, []);
  /** 탭 클릭 인텐트 — 본문 슬라이드는 `route-transition-config` pathname 단일 소스 (`mainShellTabSlide` 미사용) */
  const beginBottomNavNavigation = useCallback(
    (href: string, source?: MenuNavigationSource, options?: BeginMenuNavigationOptions) => {
      dismissLoginRequiredSheet();
      return beginMenuNavigation(href, source ?? "bottom-nav", options);
    },
    [beginMenuNavigation]
  );

  const [portalToBody, setPortalToBody] = useState(false);
  useLayoutEffect(() => {
    if (bodyPortal) setPortalToBody(true);
  }, [bodyPortal]);

  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const { t } = useI18n();
  const hubDomain = useMemo(() => resolveMainBottomNavHubDomain(pathname ?? null), [pathname]);

  /**
   * ONE BottomNav commit — confirm popup 없음.
   * Chat: requireAuthAction = gate only; success → commitMainBottomNavRoute (bare router.push 금지).
   * Already-authed Chat: sync commit (DO NOT park beginMenuNavigation / cover axis behind await).
   * same-tab: scroll_only without auth gate.
   */
  const commitTabRoute = useCallback((tabId: string, commitOpts: BottomNavTabCommitOpts) => {
    void tabId;
    if (shouldMainBottomNavRouteScrollOnly(commitOpts.pathname, commitOpts.navSearch, commitOpts.href)) {
      /** 같은 탭 다시 누름 = 맨 위로 + 햅틱 1회 */
      triggerBottomNavSelectionFeedback();
      scrollAppShellToTop();
      commitOpts.onCloseDomainSwitcher?.();
      return;
    }
    const run = () => {
      const result = commitBottomNavTabRoute(commitOpts);
      /** 햅틱 = 선택이 확정된 순간 1회. 거부된 탭은 울리지 않는다 */
      if (result !== "blocked") triggerBottomNavSelectionFeedback();
      return result;
    };
    if (commitOpts.href.includes("/community-messenger")) {
      const boot = peekAppBootProfile();
      const cached =
        getCurrentUser() ?? (boot?.id ? profileRowToClientProfile(boot) : null);
      if (cached?.id && isClientSignupComplete(cached)) {
        console.info("[bottom-nav-tap] path=sync", { reason: "profile_cached", href: commitOpts.href });
        run();
        return;
      }
      /**
       * P5 §B5-1 (첫 탭 무시): 로그인 확인 중(`loading`·`recovering`)이고 프로필 캐시만 없을 때는 문지기로 기다리지 않고
       * 누른 즉시 이동(`bottom_nav_explicit`)한다. 회원·비회원 판정은 메신저 경로의 화면 게이트(CommunityMessengerGuestGate)가 맡는다.
       * 예전에는 `requireAuthAction` 이 확인 실패 시 조용히 false(auth_resolution_hold) → 탭이 되돌아가고, 통과해도
       * `bottom_nav_async` 로 방 진입 잠금에 막힐 수 있었다. 비회원 확정 등 그 밖의 상태는 아래 기존 경로(로그인 시트).
       */
      const sessionPhase = getSessionPhase();
      if (isRecoveringPhase(sessionPhase)) {
        console.info("[bottom-nav-tap] path=sync", { reason: "session_resolving", phase: sessionPhase, href: commitOpts.href });
        const result = run();
        /** 확인이 끝나면 같은 회원 게이트(가입 동의·프로필 완성)를 실행 — 비회원은 화면 게이트의 로그인 안내 */
        if (result !== "blocked") void enforceAuthGatesAfterDeferredNavigation("messenger_open", { next: commitOpts.href });
        return;
      }
      console.info("[bottom-nav-tap] path=async", { reason: "auth_gate", phase: sessionPhase, href: commitOpts.href });
      /**
       * 프로필 캐시가 아직 없을 때(B11): 로그인 확인을 기다리는 동안에도 누른 즉시 선택·뼈대를 보인다.
       * 회원으로 확인되면 같은 커밋으로 이동, 비회원·취소면 컨트롤러를 되돌린다(로그인 시트는 requireAuthAction 이 띄움).
       */
      const axis = computeMainBottomNavPushAxis(commitOpts.pathname, commitOpts.href);
      setMainShellPushAxisIntent(axis, pathFromHref(commitOpts.href));
      const pendingId = beginBottomNavShowing({
        tabId: commitOpts.tabId,
        href: commitOpts.href,
        fromPath: commitOpts.pathname,
      });
      triggerBottomNavSelectionFeedback();
      const failPending = () => {
        if (pendingId != null) failBottomNavShowing(pendingId);
      };
      void requireAuthAction("messenger_open", () => {
        commitBottomNavTabRoute({ ...commitOpts, deferredAfterAwait: true });
      }, { next: commitOpts.href }).then((ok) => {
        if (!ok) failPending();
      }, failPending);
      return;
    }
    run();
  }, []);

  const effectiveOuterExtra = extraOuterClassName;
  /** D1 F1 — `<html>` 셸 속성(하단 탭 유무·모양·원형 탭) 갱신. 모양은 클래스·경로(원형 강조)로 바뀐다 */
  useHtmlShellFlagsSync(
    `${presentation}|${extraOuterClassName}|${usesDeliveryHubShell ? 1 : 0}|${pathname}|${hubDomain ?? ""}|${displayTabs.map((t) => t.id).join(",")}`
  );

  const sideRailKeyboardHoldActive =
    presentation === "side-rail" && sideRailKeyboardHoldHeightPx != null && sideRailKeyboardHoldHeightPx > 0;
  const outerClass = [
    BOTTOM_NAV_SHELL.outerClassName,
    presentation === "side-rail" ? BOTTOM_NAV_SIDE_RAIL_CLASS : "",
    presentationEnter === "rail"
      ? "app-bottom-nav-shell--enter-rail"
      : presentationEnter === "bottom"
        ? "app-bottom-nav-shell--enter-bottom"
        : "",
    bodyPortal || effectiveOuterExtra.length > 0 ? BOTTOM_NAV_OUTER_MOTION : "",
    effectiveOuterExtra,
  ]
    .filter(Boolean)
    .join(" ");

  const renderBottomNavTab = useCallback(
    (tab: BottomNavItemConfig, _tabIndex: number) => {
      const groupEdgeClass = "";
      const pendingChatNav =
        showingTabId != null && isMainBottomNavUnifiedInboxTabId(showingTabId);
      const emphasisKind = resolveMainBottomNavTabEmphasisKind(tab.id, pathname, {
        hubDomain,
        pendingChatNav: pendingChatNav && tab.id === showingTabId,
      });
      const guardNav = (nextHref?: string) => {
        dismissLoginRequiredSheet();
        const targetHref =
          nextHref ??
          resolveMainBottomNavTabTapHref(tab.id, tab.href, {
            emphasisKind,
            pathname,
            searchParams,
            ownerStoreId: ownerNav.storeId,
          });
        return guardBeforeNavigate(targetHref);
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
            showingTabId={showingTabId}
            onNavigationIntent={markBottomNavIntent}
            beginMenuNavigation={beginBottomNavNavigation}
            guardBeforeNavigate={guardNav}
            onCloseDomainSwitcher={closeSwitcherOnNav}
            commitTabRoute={commitTabRoute}
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
            showingTabId={showingTabId}
            onNavigationIntent={markBottomNavIntent}
            beginMenuNavigation={beginBottomNavNavigation}
            guardBeforeNavigate={guardNav}
            onCloseDomainSwitcher={closeSwitcherOnNav}
            emphasisKind={emphasisKind}
            commitTabRoute={commitTabRoute}
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
          showingTabId={showingTabId}
          onNavigationIntent={markBottomNavIntent}
          beginMenuNavigation={beginBottomNavNavigation}
          guardBeforeNavigate={guardNav}
          onCloseDomainSwitcher={closeSwitcherOnNav}
          emphasisKind={emphasisKind}
          commitTabRoute={commitTabRoute}
        />
      );
    },
    [
      pathname,
      navSearch,
      searchParams,
      ownerNav.storeId,
      showingTabId,
      markBottomNavIntent,
      beginBottomNavNavigation,
      guardBeforeNavigate,
      usesDeliveryHubShell,
      hubDomain,
      commitTabRoute,
    ]
  );

  const nav = (
    <nav
      className={[
        outerClass,
        usesDeliveryHubShell ? "app-bottom-nav-shell--delivery" : "",
        sideRailKeyboardHoldActive ? BOTTOM_NAV_SIDE_RAIL_KEYBOARD_HOLD_CLASS : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        sideRailKeyboardHoldActive
          ? ({ "--app-side-rail-keyboard-hold-height": `${sideRailKeyboardHoldHeightPx}px` } as CSSProperties)
          : undefined
      }
      aria-label={t("nav_bottom_bar_aria")}
      inert={inert || undefined}
      data-app-bottom-nav=""
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

  if (bodyPortal && portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }

  return nav;
}

