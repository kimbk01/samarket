"use client";

import dynamic from "next/dynamic";
import { Suspense, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { BootThumbnailObserver } from "@/components/app/BootThumbnailObserver";
import { markBootMetricsShellReady } from "@/lib/startup/startup-metrics";
import {
  BUNDLED_STARTUP_NAV,
  scheduleStartupShellCachePersist,
} from "@/lib/startup/startup-cache";
import {
  BOTTOM_NAV_ITEMS,
  resolveBottomNavScrollHideOuterClass,
} from "@/lib/main-menu/bottom-nav-config";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { BottomNavScrollChromeProvider } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import {
  resolveBottomNavScrollHideEnabled,
  useBottomNavScrollHide,
} from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import { useBrowseScrollChromeHidden } from "@/lib/stores/use-browse-scroll-chrome-hidden";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";
import { shouldRenderMainBottomNav } from "@/lib/navigation/bottom-nav-route-policy";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS } from "@/lib/ui/messenger-split-pane-layout";
import {
  mainBottomNavPrefetchTriggerKey,
  type MainBottomNavPrefetchDomain,
} from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import { scrollAppShellToTopAfterShellNavigation } from "@/lib/layout/scroll-app-shell-to-top";
import {
  buildMainShellInnerRootClass,
  MAIN_COLUMN_SCROLL_CLASS,
  resolvesMainScrollInMainColumn,
} from "@/lib/layout/main-shell-viewport";
import {
  MAIN_HUB_SCROLL_HEADER_CLASS,
  MAIN_HUB_SCROLL_SHELL_ROOT_CLASS,
  resolvesMainHubScrollColumn,
} from "@/lib/layout/main-hub-scroll-column";
import { MainHubScrollBody } from "./MainHubScrollColumn";
import { invalidateMainAppScrollRootCache } from "@/lib/layout/main-app-scroll-root";
import { logDevSafeModeProbeOnce } from "@/lib/dev/is-dev-safe-mode";
import {
  getStoreOwnerMainBottomNavSuppressed,
  subscribeStoreOwnerMainBottomNavSuppressed,
} from "@/lib/business/store-owner-main-bottom-nav-suppress";
import {
  getMessengerCallMainBottomNavSuppressed,
  subscribeMessengerCallMainBottomNavSuppressed,
} from "@/lib/layout/messenger-call-main-bottom-nav-suppress";
import { MessagingGlobalChrome } from "@/components/layout/providers/MessagingGlobalChrome";
import { AppStickyHeader } from "./AppStickyHeader";
import { RegionBar } from "./RegionBar";
import { MainShellTabContentTransition } from "./MainShellTabContentTransition";
import { BottomNav } from "./BottomNav";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const PhilifeFeedWarmPrefetch = dynamic(
  () => import("@/components/community/PhilifeFeedWarmPrefetch").then((mod) => mod.PhilifeFeedWarmPrefetch),
  { ssr: false }
);
const WebConnectivityBanner = dynamic(
  () => import("@/components/layout/WebConnectivityBanner").then((mod) => mod.WebConnectivityBanner),
  { ssr: false }
);
/** 거래 허브 FAB 서브그래프만 별도 청크 — 표시 조건·DOM 위치는 기존과 동일. */
const HomeTradeHubFloatingBarLazy = dynamic(
  () => import("@/components/home/HomeTradeHubFloatingBar").then((m) => m.HomeTradeHubFloatingBar),
  { ssr: false }
);
const MainBottomNavFabSectorLazy = dynamic(
  () => import("@/components/layout/MainBottomNavFabSector").then((m) => m.MainBottomNavFabSector),
  { ssr: false }
);
const CommunityMessengerRoomOpeningOverlayHostLazy = dynamic(
  () =>
    import("@/components/community-messenger/room/CommunityMessengerRoomOpeningOverlayHost").then(
      (m) => m.CommunityMessengerRoomOpeningOverlayHost
    ),
  { ssr: false }
);

/** First child layout effect — fires before BottomNav sibling layout work. */
function MarkAppShellReadyOnce({
  pathname,
  routeSearch,
}: {
  pathname: string | null;
  routeSearch: string;
}) {
  useLayoutEffect(() => {
    markBootMetricsShellReady();
    const path =
      (pathname && pathname.trim() ? pathname : "/") + (routeSearch ? `?${routeSearch}` : "");
    const tab =
      BOTTOM_NAV_ITEMS.find((t) => {
        const hrefPath = t.href.split("?")[0] ?? t.href;
        const cur = (pathname ?? "/").split("?")[0] || "/";
        if (t.id === "community") return cur === "/" || cur === "/philife" || cur.startsWith("/philife/");
        return cur === hrefPath || cur.startsWith(`${hrefPath}/`);
      })?.id ?? "community";
    const lang =
      typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ko";
    scheduleStartupShellCachePersist({
      lang,
      theme: "system",
      nav: BUNDLED_STARTUP_NAV.map((t) => ({ ...t })),
      route: { path, tabId: tab },
    });
  }, [pathname, routeSearch]);
  return null;
}

export function ConditionalAppShell({
  children,
  regionBarInLayout = false,
  initialMainBottomNavItems = null,
}: {
  children: React.ReactNode;
  /** true면 **메인 1단**(`RegionBar`)는 `AppStickyHeader`에서만 렌더 — 여기서 중복 삽입 안 함 (`lib/layout/main-tier1.ts`) */
  regionBarInLayout?: boolean;
  initialMainBottomNavItems?: BottomNavItemConfig[] | null;
}) {
  const pathname = usePathname();
  /**
   * DO NOT useSearchParams() here — this shell wraps `/stores/owner/**` above page Suspense.
   * Suspending remount paints only `Loading…` with no `data-biz` Owner shell.
   * Reuse Owner Admin non-suspending search SSOT (`window.location.search`).
   */
  const searchParams = useOwnerAdminUrlSearchParams();
  const routeSearch = searchParams.toString();
  useLayoutEffect(() => {
    logDevSafeModeProbeOnce("client");
  }, []);
  useLayoutEffect(() => {
    invalidateMainAppScrollRootCache();
  }, [pathname]);
  /** 하단 탭 전환(커뮤니티↔거래↔배달↔내정보 등) 시 별도 도메인으로 바뀌면 본문 스크롤 위치가 남지 않게 한다 */
  const prevBottomNavPrefetchDomainRef = useRef<MainBottomNavPrefetchDomain | null>(null);
  useLayoutEffect(() => {
    const next = mainBottomNavPrefetchTriggerKey(pathname ?? null);
    if (prevBottomNavPrefetchDomainRef.current === null) {
      prevBottomNavPrefetchDomainRef.current = next;
      return;
    }
    const prev = prevBottomNavPrefetchDomainRef.current;
    prevBottomNavPrefetchDomainRef.current = next;
    if (prev !== next) {
      scrollAppShellToTopAfterShellNavigation();
    }
  }, [pathname]);

  const f = useMemo(
    () => resolveConditionalAppShellFlags(pathname, regionBarInLayout),
    [pathname, regionBarInLayout]
  );
  const isMessengerSplitViewport = useIsMessengerSplitViewport();
  const storeOwnerFlyoutSuppressesBottomNav = useSyncExternalStore(
    subscribeStoreOwnerMainBottomNavSuppressed,
    getStoreOwnerMainBottomNavSuppressed,
    () => false
  );
  const messengerCallSuppressesBottomNav = useSyncExternalStore(
    subscribeMessengerCallMainBottomNavSuppressed,
    getMessengerCallMainBottomNavSuppressed,
    () => false
  );
  const { isOpen: headerMessengerFromPhilife } = usePhilifeHeaderMessengerStack();
  const { pendingMenuIntent, isPendingMenuBlockingContent } = useLatestMenuNavigation();
  const { isOpen: philifeWriteSheetOpen } = usePhilifeWriteSheet();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const pathNoQuery = pathname?.split("?")[0] ?? "";
  const isMessengerStackSurface = isMessengerFromHeaderStackSurface(pathNoQuery);
  const isPhilifeFeedPath = pathNoQuery === "/philife" || pathNoQuery === "/";
  const isTradeWriteSheetSurface =
    Boolean(tradeWriteSheet?.isOpen) &&
    (pathNoQuery === "/market" ||
      pathNoQuery === "/philife" ||
      pathNoQuery === "/" ||
      (pathNoQuery.startsWith("/market/") &&
        pathNoQuery !== "/market/trade-meet-spot" &&
        !pathNoQuery.startsWith("/market/trade-meet-spot/")));
  /** `/philife`·거래 글쓰기 시트 — 하단 탭 숨김 */
  const suppressBottomNavForWriteSheet =
    (isPhilifeFeedPath && philifeWriteSheetOpen) || isTradeWriteSheetSurface;
  /** 헤더 메신저 풀스택이 열리면 본문과 함께 밀리지 않도록 탭 숨김 — `/philife`·거래(`/market*`) 동일 */
  const showBottomNavEffective = shouldRenderMainBottomNav({
    pathname: pathNoQuery,
    isWriteSheetOpen: suppressBottomNavForWriteSheet,
    isMessengerStackSurface,
    headerMessengerFromPhilife,
    storeOwnerFlyoutSuppressesBottomNav,
    messengerCallSuppressesBottomNav,
    messengerSplitViewport: isMessengerSplitViewport,
  });
  const showBottomNavMounted = showBottomNavEffective;
  const mainBottomClassLive = useMemo(() => {
    if (!storeOwnerFlyoutSuppressesBottomNav) {
      return f.mainBottomClass;
    }
    return f.isChatRoomDetail || f.isCommunityMessengerSurface || f.isTradeMeetSpotPickRoute
      ? f.mainBottomClass
      : "pb-4";
  }, [storeOwnerFlyoutSuppressesBottomNav, f]);
  const bottomNavScrollHideEnabled =
    showBottomNavMounted &&
    resolveBottomNavScrollHideEnabled(pathNoQuery, headerMessengerFromPhilife, routeSearch);
  const isBrowseRoute = pathNoQuery.startsWith("/stores/browse/");
  const browseScrollChromeHidden = useBrowseScrollChromeHidden(
    Boolean(bottomNavScrollHideEnabled && isBrowseRoute)
  );
  const bottomNavScrollRouteKey = useMemo(() => {
    if (
      isPendingMenuBlockingContent &&
      pendingMenuIntent &&
      (pendingMenuIntent.source === "trade-primary" ||
        pendingMenuIntent.source === "trade-topic" ||
        pendingMenuIntent.source === "category-chip" ||
        pendingMenuIntent.source === "bottom-nav")
    ) {
      const search = pendingMenuIntent.search ? `?${pendingMenuIntent.search}` : "";
      return `${pendingMenuIntent.pathname}${search}`;
    }
    return `${pathNoQuery}?${routeSearch}`;
  }, [
    pathNoQuery,
    routeSearch,
    isPendingMenuBlockingContent,
    pendingMenuIntent,
  ]);
  const defaultBottomNavHiddenByScroll = useBottomNavScrollHide(
    Boolean(bottomNavScrollHideEnabled && !isBrowseRoute),
    bottomNavScrollRouteKey
  );
  const bottomNavHiddenByScroll = isBrowseRoute ? browseScrollChromeHidden : defaultBottomNavHiddenByScroll;
  const heroMenuSurface = f.isStoreOrderHeroMenuSurface;
  const mainScrollInMainColumn = resolvesMainScrollInMainColumn({
    isChatRoomDetail: f.isChatRoomDetail,
    isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
    isMainColumnViewportLocked: f.isMainColumnViewportLocked,
  });
  /** 네이티브 오버스크롤이 비추는 문서 루트 배경 — `globals.css` 의 `.sam-store-order-hero-doc-root` */
  useLayoutEffect(() => {
    const cls = "sam-store-order-hero-doc-root";
    const root = document.documentElement;
    if (!heroMenuSurface) {
      root.classList.remove(cls);
      return;
    }
    root.classList.add(cls);
    return () => root.classList.remove(cls);
  }, [heroMenuSurface]);
  const mainShellInnerRootClass =
    mainScrollInMainColumn || f.isStoreOwnerAdminRoute
      ? buildMainShellInnerRootClass({ heroMenuSurface })
      : `${f.appShellRootClass} min-h-dvh bg-sam-app`;
  const hubScrollColumn = resolvesMainHubScrollColumn({
    regionBarInLayout,
    mainScrollInMainColumn,
    isChatRoomDetail: f.isChatRoomDetail,
  });
  const mainSurfaceClass = `${mainBottomClassLive} min-w-0 ${heroMenuSurface ? "bg-transparent" : "bg-sam-app"}`;
  const mainBodyLockedClass =
    f.isMainColumnViewportLocked || f.isStoreOwnerAdminRoute
      ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden"
      : mainScrollInMainColumn
        ? MAIN_COLUMN_SCROLL_CLASS
        : "overflow-x-hidden";
  const fillColumnForChildScroll =
    f.isMainColumnViewportLocked ||
    f.isStoreOwnerAdminRoute ||
    f.isCommunityMessengerHubListSurface;
  const mainInnerColumn = (
    <div
      className={`${APP_MAIN_COLUMN_CLASS} ${
        fillColumnForChildScroll ? " flex min-h-0 min-w-0 flex-1 flex-col" : ""
      }`}
    >
      {children}
    </div>
  );

  const mainBodyTransition = (
    <MainShellTabContentTransition
      initialNavItems={initialMainBottomNavItems}
      contentStretchClass="main-shell-push-host flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      hubChromeHeader={
        hubScrollColumn ? (
          <div className={MAIN_HUB_SCROLL_HEADER_CLASS}>
            <AppStickyHeader />
          </div>
        ) : null
      }
    >
      {hubScrollColumn ? (
        <MainHubScrollBody
          className={`${mainSurfaceClass}${
            f.isCommunityMessengerHubListSurface ? " main-hub-scroll-body--child-scroll-lock" : ""
          }`}
        >
          {mainInnerColumn}
        </MainHubScrollBody>
      ) : (
        <div
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            f.isMainColumnViewportLocked || f.isStoreOwnerAdminRoute
              ? "flex min-h-0 overflow-x-hidden overflow-y-hidden"
              : mainScrollInMainColumn
                ? MAIN_COLUMN_SCROLL_CLASS
                : "flex overflow-x-hidden"
          }`}
        >
          {mainInnerColumn}
        </div>
      )}
    </MainShellTabContentTransition>
  );
  const bottomNavScrollHidden = Boolean(bottomNavScrollHideEnabled && bottomNavHiddenByScroll);
  /**
   * Clearance SSOT — mount only (`showBottomNavEffective`).
   * DO NOT couple to scroll-hide: hide is transform-only; coupling caused hub thrash.
   */
  const bottomNavOccupiesClearance = showBottomNavEffective;
  return (
    <BottomNavScrollChromeProvider
      hidden={bottomNavScrollHidden}
      occupiesClearance={bottomNavOccupiesClearance}
    >
    {/** 허브: `MainHubScrollColumn` + `app-shell.css` `.main-hub-scroll-*` — 1단 고정·본문 단일 스크롤 */}
    <div
      className={`app-shell w-full min-w-0 ${
        hubScrollColumn ? `min-h-0 flex-1 ${MAIN_HUB_SCROLL_SHELL_ROOT_CLASS}` : mainShellInnerRootClass
      } ${hubScrollColumn && !heroMenuSurface ? "bg-sam-app" : ""}`}
    >
      {/** App Ready before BottomNav layout — children layout effects run depth-first first→last */}
      <MarkAppShellReadyOnce pathname={pathname} routeSearch={routeSearch} />
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      <MessagingGlobalChrome regionBarInLayout={regionBarInLayout} />
      <CommunityMessengerRoomOpeningOverlayHostLazy />
      <WebConnectivityBanner />
      {f.showRegionBar ? <RegionBar /> : null}
      {hubScrollColumn ? (
        /**
         * MAIN hub: Header+Body share ONE push-surface transform authority
         * (`hubChromeHeader` inside `MainShellTabContentTransition`).
         * BottomNav stays outside (tx=0).
         */
        mainBodyTransition
      ) : (
        <main className={`${mainSurfaceClass} ${mainBodyLockedClass} flex min-h-0 flex-1 flex-col`}>
          {mainBodyTransition}
        </main>
      )}
      {showBottomNavMounted ? (
        <BottomNav
          initialTabs={initialMainBottomNavItems}
          bodyPortal={isMessengerStackSurface}
          extraOuterClassName={[
            bottomNavScrollHideEnabled
              ? resolveBottomNavScrollHideOuterClass(bottomNavHiddenByScroll)
              : "",
            /**
             * Path-based (not JS matchMedia) — CSS `@media (min-width:768px)` owns width.
             * Avoids SSR false → full-width flash then shrink.
             */
            pathname === "/community-messenger" ||
            (pathname?.startsWith("/community-messenger/") ?? false)
              ? APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ) : null}
      {showBottomNavMounted && f.showHomeTradeHubFloatingBar && !isTradeWriteSheetSurface ? (
        <HomeTradeHubFloatingBarLazy />
      ) : null}
      {f.showMainBottomNavFabSector && !messengerCallSuppressesBottomNav ? (
        <MainBottomNavFabSectorLazy />
      ) : null}
      <BootThumbnailObserver />
    </div>
    </BottomNavScrollChromeProvider>
  );
}
