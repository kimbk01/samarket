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
  BOTTOM_NAV_OUTER_MOTION,
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
import { shouldDeferUnreadBadgeRepaint } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
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
import { isDeliveryBottomNavRail } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { DeliveryDomainSwitcherOverlay } from "@/components/delivery/navigation/DeliveryDomainSwitcherOverlay";
import { MAIN_BOTTOM_NAV_TAB_ICONS } from "@/components/main-menu/MainBottomNavTabIcons";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import {
  bottomNavMessengerHrefWithOrigin,
  parseMessengerEntryOrigin,
  persistMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import {
  navPerfMarkBottomNavClickStart,
  navPerfSetOptimisticTotalMs,
} from "@/lib/navigation/nav-perf-browser";
import { useRegion } from "@/contexts/RegionContext";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";

/** 매장 운영 허브 — cross-tab RSC·taxonomy·philife prewarm 금지 (`pickMainBottomNavPrefetchHrefs` 와 동일) */
function shouldSkipBottomNavBackgroundPrefetch(pathname: string | null): boolean {
  const domain: MainBottomNavPrefetchDomain = mainBottomNavPrefetchTriggerKey(pathname);
  return domain === "store_owner" || isMainBottomNavMessengerShellPathname(pathname);
}

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
    router: Pick<ReturnType<typeof useRouter>, "prefetch">;
    /** stores 탭 등 — `prewarmBottomNavTapTargetClientCache` 대신 */
    onPrewarm?: () => void;
    /** 배달 도메인 다이얼 열림 시 탭 탭으로 닫기 */
    onCloseDomainSwitcher?: () => void;
  }
): void {
  const {
    pathname,
    navSearch,
    href,
    tabId,
    isActive,
    beginMenuNavigation,
    onNavigationIntent,
    guardBeforeNavigate,
    router,
    onPrewarm,
    onCloseDomainSwitcher,
  } = opts;

  onCloseDomainSwitcher?.();

  if (shouldBottomNavTapScrollOnlyNoNavigate(pathname, navSearch, href)) {
    e.preventDefault();
    scrollAppShellToTop();
    return;
  }
  if (!guardBeforeNavigate(href)) {
    e.preventDefault();
    return;
  }

  const navClickT0 = performance.now();
  markBottomNavRouteIntentForBackgroundWarm();
  navPerfMarkBottomNavClickStart(navClickT0);
  beginMenuNavigation(href);
  onNavigationIntent(tabId);
  if (tabId === "chat" || tabId === "delivery-order-chat") {
    try {
      const u = new URL(href, "https://samarket.local");
      const o = parseMessengerEntryOrigin(u.searchParams.get("from"));
      if (o) persistMessengerEntryOrigin(o);
    } catch {
      /* noop */
    }
  }
  navPerfSetOptimisticTotalMs(performance.now() - navClickT0);

  if (!isActive) {
    try {
      void router.prefetch(href);
    } catch {
      /* noop */
    }
    try {
      if (onPrewarm) onPrewarm();
      else prewarmBottomNavTapTargetClientCache(href);
    } catch {
      /* noop */
    }
  }
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
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
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
  const Icon = TAB_ICONS[tab.icon];
  const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

  const effectiveHref = useMemo(() => {
    if (tab.id === "delivery-orders") {
      return resolveDeliveryOrderHistoryHref(ownerStore?.id);
    }
    if (tab.id === "chat") {
      return bottomNavMessengerHrefWithOrigin(tab.href, pathname, searchParams);
    }
    return tab.href;
  }, [tab.id, tab.href, pathname, searchParams, ownerStore?.id]);

  const className = [
    "app-bottom-nav-item group",
    BOTTOM_NAV_ITEM_TOUCH_CLASS,
    itemClassName,
    tab.id === "my" ? "app-bottom-nav-item--my-menu" : "",
    hasOwnerStore && !isActive ? "opacity-95" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLbl =
    tabBadgeCount > 0
      ? t("nav_attention_needed", { label: tabLabel, count: tabBadgeCount })
      : tab.id === "my"
        ? t("nav_bottom_my")
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
      href={effectiveHref}
      prefetch={shouldEnableNextLinkPrefetchOnMainNav() && !isMainBottomNavMessengerShellPathname(pathname)}
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
        if (e.key === "Enter") return;
        if (e.key !== " ") return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      onClick={(e) => {
        runBottomNavTabClick(e, {
          pathname,
          navSearch,
          href: effectiveHref,
          tabId: tab.id,
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
}: {
  tab: BottomNavItemConfig;
  itemClassName?: string;
  pathname: string | null;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
}) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
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

  return (
    <button
      type="button"
      className={className}
      data-active={isActive ? "true" : "false"}
      data-switcher-open={switcherOpen ? "true" : "false"}
      aria-label={tabLabel}
      aria-expanded={switcherOpen}
      aria-haspopup="dialog"
      onClick={() => onToggleSwitcher()}
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
      <span className={`app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`} suppressHydrationWarning>
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
  const commerceCart = useStoreCommerceCartOptional();
  const searchParams = useSearchParams();
  const secondaryRail = useMemo(
    () => resolveMainBottomNavSecondaryRailKind(pathname, searchParams),
    [pathname, searchParams]
  );
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const effectiveHref = useMemo(() => {
    if (!commerceCart?.hydrated) return tab.href;
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart, tab.href]);
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
      replace={mainTabLinkUsesReplace(pathname ?? null, effectiveHref)}
      scroll={false}
      className={className}
      data-active={isActive ? "true" : "false"}
      aria-label={tabLabel}
      aria-current={isActive ? "page" : undefined}
      onPointerDown={(e) => triggerLightTapFeedback(e)}
      onClick={(e) => {
        runBottomNavTabClick(e, {
          pathname,
          navSearch,
          href: effectiveHref,
          tabId: tab.id,
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
      <span className={`app-bottom-nav-label ${tab.labelFontFamilyClass ?? ""}`} suppressHydrationWarning>
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
        if (e.key === "Enter") return;
        if (e.key !== " ") return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      onClick={(e) => {
        runBottomNavTabClick(e, {
          pathname,
          navSearch,
          href: tab.href,
          tabId: tab.id,
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
  const secondaryRail = useMemo(
    () => resolveMainBottomNavSecondaryRailKind(pathname ?? null, searchParams),
    [pathname, searchParams]
  );
  const isDeliveryNavMode = isDeliveryBottomNavRail(secondaryRail);
  const displayTabs = useMemo(
    () => composeMainBottomNavDisplayTabs(pathname ?? null, tabs, searchParams, ownerStoreRow?.id),
    [pathname, tabs, searchParams, ownerStoreRow?.id]
  );
  const [deliveryDomainSwitcherOpen, setDeliveryDomainSwitcherOpen] = useState(false);
  useEffect(() => {
    setDeliveryDomainSwitcherOpen(false);
  }, [pathname]);
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

  const scrollHideSuppressed =
    deliveryDomainSwitcherOpen && extraOuterClassName.includes("translate-y-full");
  const effectiveOuterExtra = scrollHideSuppressed
    ? extraOuterClassName.replace(/\btranslate-y-full\b/g, "").trim() || "translate-y-0"
    : extraOuterClassName;

  const outerClass = [
    BOTTOM_NAV_SHELL.outerClassName,
    bodyPortal || (effectiveOuterExtra.length > 0 && effectiveOuterExtra.includes("translate-y"))
      ? BOTTOM_NAV_OUTER_MOTION
      : "",
    effectiveOuterExtra,
    isDeliveryNavMode && deliveryDomainSwitcherOpen ? "app-bottom-nav-shell--switcher-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const closeDomainSwitcher = useCallback(() => {
    setDeliveryDomainSwitcherOpen(false);
  }, []);

  const renderBottomNavTab = useCallback(
    (tab: BottomNavItemConfig, tabIndex: number) => {
      const groupEdgeClass = isDeliveryNavMode
        ? ""
        : tabIndex === 2
          ? "app-bottom-nav-item--group-gap-after"
          : tabIndex === 3
            ? "app-bottom-nav-item--group-gap-before"
            : "";
      const guardNav = () => {
        const targetHref =
          tab.id === "chat" || tab.id === "delivery-order-chat"
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
      if (tab.id === "delivery-home-hub") {
        return (
          <BottomNavTabDeliveryHomeHub
            key={tab.id}
            tab={tab}
            itemClassName={groupEdgeClass}
            pathname={pathname}
            switcherOpen={deliveryDomainSwitcherOpen}
            onToggleSwitcher={() => setDeliveryDomainSwitcherOpen((open) => !open)}
          />
        );
      }
      const closeSwitcherOnNav =
        isDeliveryNavMode && deliveryDomainSwitcherOpen ? closeDomainSwitcher : undefined;

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
      if (tab.icon === "stores" && !isDeliveryNavMode) {
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
      isDeliveryNavMode,
      deliveryDomainSwitcherOpen,
      closeDomainSwitcher,
    ]
  );

  const navGridClass = isDeliveryNavMode ? "app-bottom-nav-grid" : "app-bottom-nav-split";

  const nav = (
    <nav
      className={[outerClass, isDeliveryNavMode ? "app-bottom-nav-shell--delivery" : ""].filter(Boolean).join(" ")}
      aria-label={t("nav_bottom_bar_aria")}
    >
      <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`}>
        <div className={navGridClass}>
          {displayTabs.map((tab, index) => renderBottomNavTab(tab, index))}
        </div>
      </div>
    </nav>
  );

  if (hideBottomNavShell) return null;

  const switcherOverlay =
    isDeliveryNavMode ? (
      <DeliveryDomainSwitcherOverlay
        open={deliveryDomainSwitcherOpen}
        onClose={() => setDeliveryDomainSwitcherOpen(false)}
      />
    ) : null;

  if (bodyPortal && portalToBody && typeof document !== "undefined") {
    return (
      <>
        {createPortal(nav, document.body)}
        {switcherOverlay ? createPortal(switcherOverlay, document.body) : null}
      </>
    );
  }

  return (
    <>
      {nav}
      {switcherOverlay}
    </>
  );
}

