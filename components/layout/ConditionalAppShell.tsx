"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { BootThumbnailObserver } from "@/components/app/BootThumbnailObserver";
import {
  markBootMetricsShellReady,
  markInitialDestinationVisualReady,
} from "@/lib/startup/startup-metrics";
import {
  BUNDLED_STARTUP_NAV,
  scheduleStartupShellCachePersist,
} from "@/lib/startup/startup-cache";
import {
  BOTTOM_NAV_ITEMS,
  resolveBottomNavScrollHideOuterClass,
} from "@/lib/main-menu/bottom-nav-config";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { readDibayHostShellAttr } from "@/lib/platform/dibay-windows-shell";
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
import {
  getSupportModalMainBottomNavSuppressed,
  subscribeSupportModalMainBottomNavSuppressed,
} from "@/lib/support/support-modal-main-bottom-nav-suppress";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS } from "@/lib/ui/messenger-split-pane-layout";
import { AppScrollMemory } from "@/components/layout/AppScrollMemory";
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
import { HubRetentionStack } from "./HubRetentionStack";
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
import { BottomNavKeyboardHideProbe } from "./BottomNavKeyboardHideProbe";
import {
  BOTTOM_NAV_KEYBOARD_RESIZED_CLASS,
  type BottomNavKeyboardHideState,
} from "@/lib/layout/bottom-nav-keyboard-hide";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { SupportFabRegistryProvider } from "@/lib/support/support-fab-registry";
import { SupportModalHost } from "@/components/support/SupportModalHost";
import { MainShellDocumentLoading } from "@/components/layout/MainRouteLoading";
import { SHELL_HYDRATED_HTML_ATTR, useShellHydrated } from "@/lib/ui/use-shell-hydrated";
import { useDibayAppShellAuthority } from "@/lib/device/use-dibay-app-shell";
import { isCommunityHomeSurfacePath, isHomeSurfacePath, resolveMainSurface } from "@/lib/layout/resolve-main-surface";

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
const SupportFabHostLazy = dynamic(
  () => import("@/components/support/SupportFabHost").then((m) => m.SupportFabHost),
  { ssr: false }
);
/** CUT 2 — exactly one GlobalPopupHost in (main) shell; no route-local hosts. */
const GlobalPopupHostLazy = dynamic(
  () => import("@/components/platform-popup/GlobalPopupHost").then((m) => m.GlobalPopupHost),
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
        if (t.id === "home") return isHomeSurfacePath(cur);
        if (t.id === "community") {
          return isCommunityHomeSurfacePath(cur) || cur.startsWith("/philife/") || resolveMainSurface(cur) === "trade";
        }
        return cur === hrefPath || cur.startsWith(`${hrefPath}/`);
      })?.id ?? "home";
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

function MarkInitialDestinationVisualReadyOnce({ pathname }: { pathname: string | null }) {
  useEffect(() => {
    if (!pathname) return;
    if (typeof requestAnimationFrame !== "function") {
      markInitialDestinationVisualReady();
      return;
    }
    const frame = requestAnimationFrame(() => {
      markInitialDestinationVisualReady();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return null;
}


/** Windows 셸(WebView2) 표시 — 설계 W0. 화면 속성만, 동작 분기 없음. 서버 렌더는 "" (하이드레이션 안전). */
function subscribeHostShellNoop(): () => void {
  return () => {};
}
function readHostShellServerSnapshot(): "windows" | "" {
  return "";
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
  /** C2·C5 — hydration 완료 여부 (서버·hydration 첫 렌더 false) */
  const shellHydrated = useShellHydrated();
  useLayoutEffect(() => {
    document.documentElement.setAttribute(SHELL_HYDRATED_HTML_ATTR, "");
  }, []);
  const pathname = usePathname();
  const appShell = useDibayAppShellAuthority();
  const hostShell = useSyncExternalStore(subscribeHostShellNoop, readDibayHostShellAttr, readHostShellServerSnapshot);
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
  /**
   * 스크롤 위치는 `AppScrollMemory` 1곳이 정한다 (Owner 2026-11-03 스크롤 SSOT) — 도메인이 바뀌면 무조건 맨 위로 보내던
   * 처리는 탭 복귀·뒤로 복원과 같은 프레임에서 경쟁해 제거했다(새 진입·탭 다시 누르기는 규칙이 맨 위로 보낸다).
   */

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
  const supportModalSuppressesBottomNav = useSyncExternalStore(
    subscribeSupportModalMainBottomNavSuppressed,
    getSupportModalMainBottomNavSuppressed,
    () => false
  );
  const { isOpen: headerMessengerFromPhilife } = usePhilifeHeaderMessengerStack();
  const { pendingMenuIntent, isPendingMenuBlockingContent } = useLatestMenuNavigation();
  const { isOpen: philifeWriteSheetOpen } = usePhilifeWriteSheet();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const pathNoQuery = pathname?.split("?")[0] ?? "";
  const isMessengerStackSurface = isMessengerFromHeaderStackSurface(pathNoQuery);
  const isPhilifeFeedPath = isCommunityHomeSurfacePath(pathNoQuery);
  const isTradeWriteSheetSurface =
    Boolean(tradeWriteSheet?.isOpen) &&
    (pathNoQuery === "/market" ||
      isPhilifeFeedPath ||
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
    supportModalSuppressesBottomNav,
    messengerSplitViewport: isMessengerSplitViewport,
  });
  const showBottomNavMounted = showBottomNavEffective;
  /**
   * 데스크톱(DESKTOP 계열) — 같은 하단 탭을 왼쪽 세로 레일로 (Owner 2026-11-07 FD4 데스크톱 조항 해제).
   * 표시 조건은 하단 탭과 동일(`showBottomNavMounted`). 레일에는 스크롤·키보드 숨김·메신저 목록 칸 폭을 쓰지 않는다.
   */
  const isDesktopSideRail = appShell.navigationPresentation === "DESKTOP_SIDE_RAIL";
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
    !isDesktopSideRail &&
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
      className={`${
        /** 내정보 주소 흐름 — 로컬 헤더가 이 열 안에 있어 앱 열 폭에 묶이면 태블릿 가로·웹에서 헤더가 좁아진다.
         * 헤더는 기기 폭 기준(설계서 §12), 본문은 페이지가 640px 열을 직접 소유 → 여기선 전체 폭. */
        /** PC(데스크톱 세로 레일) 메신저 — 본문 열 제한 없이 창 전체(카톡 PC형: 레일 | 목록 | 대화방).
         * 목록 칸 폭·768 분할 기준은 메신저 자체 계약 그대로 (docs/audit/messenger-desktop-wide-design-2026-11-07.md M1). */
        f.isMypageAddressFlowPage || (isDesktopSideRail && f.isCommunityMessengerSurface)
          ? "w-full min-w-0"
          : APP_MAIN_COLUMN_CLASS
      } ${fillColumnForChildScroll ? " flex min-h-0 min-w-0 flex-1 flex-col" : ""}`}
    >
      {/**
       * C2 (Owner 승인 2026-11-10): 셸(헤더·하단 메뉴)은 서버에서 그리고, 페이지 본문은 hydration 직후부터 —
       * 서버 HTML·hydration 첫 렌더는 기존 회색 줄 본문. 페이지 본문의 서버 렌더는 이번 범위가 아니다.
       */}
      {/** D1 (Owner 2026-11-11): 하단 탭 허브 화면 보관대 — 허브 재진입 시 다시 그리지 않음 (`HubRetentionStack`) */}
      {shellHydrated ? <HubRetentionStack>{children}</HubRetentionStack> : <MainShellDocumentLoading />}
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
      {/**
       * 메신저 목록↔채팅방 — 같은 요소 타입(MainHubScrollBody)을 유지해 이동할 때마다 메신저 레이아웃 전체
       * (게스트 게이트·스낵바·프레즌스 등)가 다시 만들어지며 깜빡이지 않게 한다. 방에서는 roomHost 로
       * 스크롤 잠금·스택 컨텍스트 없음·허브 스크롤 표식 없음(다른 화면 스크롤 탐색에 잡히지 않게).
       * D1 (2026-11-11): 그 밖의 화면도 같은 요소(plain — 예전 div 래퍼와 같은 클래스)로 유지해
       * 허브↔상세 이동에 허브 화면 보관대가 다시 만들어지지 않게 한다.
       */}
      <MainHubScrollBody
        roomHost={!hubScrollColumn && f.isCommunityMessengerRoom}
        plain={!hubScrollColumn && !f.isCommunityMessengerRoom}
        className={
          hubScrollColumn
            ? `${mainSurfaceClass}${
                f.isCommunityMessengerHubListSurface ? " main-hub-scroll-body--child-scroll-lock" : ""
              }`
            : /** 방·그 밖의 화면: 기존 래퍼(div)와 같은 클래스 — 하단 여백·배경 변화 없음 */
              `min-h-0 min-w-0 flex-1 flex-col ${
                f.isMainColumnViewportLocked || f.isStoreOwnerAdminRoute
                  ? "flex min-h-0 overflow-x-hidden overflow-y-hidden"
                  : mainScrollInMainColumn
                    ? MAIN_COLUMN_SCROLL_CLASS
                    : "flex overflow-x-hidden"
              }`
        }
      >
        {mainInnerColumn}
      </MainHubScrollBody>
    </MainShellTabContentTransition>
  );
  const bottomNavScrollHidden = Boolean(bottomNavScrollHideEnabled && bottomNavHiddenByScroll);
  /**
   * Keyboard-hide (B-1) — Android APK layout viewport shrinks with IME, fixed nav rides
   * on the keyboard. Visual translate-hide only (same class as scroll-hide); NOT fed into
   * `BottomNavScrollChromeProvider` (clearance / `hidden` SSOT stays scroll-only).
   * Probe mounts only with the nav → no listeners on nav-less routes.
   */
  const [bottomNavKeyboardState, setBottomNavKeyboardState] =
    useState<BottomNavKeyboardHideState>("visible");
  const bottomNavKeyboardHidden =
    showBottomNavMounted && !isDesktopSideRail && bottomNavKeyboardState !== "visible";
  const bottomNavKeyboardResized =
    showBottomNavMounted && !isDesktopSideRail && bottomNavKeyboardState === "hidden_layout_resized";
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
    <SupportFabRegistryProvider>
    {/** 허브: `MainHubScrollColumn` + `app-shell.css` `.main-hub-scroll-*` — 1단 고정·본문 단일 스크롤 */}
    <div
      className={`app-shell w-full min-w-0 ${
        hubScrollColumn ? `min-h-0 flex-1 ${MAIN_HUB_SCROLL_SHELL_ROOT_CLASS}` : mainShellInnerRootClass
      } ${hubScrollColumn && !heroMenuSurface ? "bg-sam-app" : ""}`}
      data-dibay-device-class={appShell.deviceClass}
      data-dibay-shell-family={appShell.shellFamily}
      data-dibay-layout-mode={appShell.layoutMode}
      data-dibay-nav-presentation={appShell.navigationPresentation}
      data-dibay-window-class={appShell.windowClass ?? ""}
      data-dibay-host-shell={hostShell}
      suppressHydrationWarning
    >
      {/** App Ready before BottomNav layout — children layout effects run depth-first first→last */}
      <MarkAppShellReadyOnce pathname={pathname} routeSearch={routeSearch} />
      {/** `useSearchParams` 경계 — 첫 그림을 막지 않게 빈 fallback */}
      <Suspense fallback={null}>
        <AppScrollMemory />
      </Suspense>
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      <MessagingGlobalChrome regionBarInLayout={regionBarInLayout} />
      <CommunityMessengerRoomOpeningOverlayHostLazy />
      <WebConnectivityBanner />
      {f.showRegionBar ? <RegionBar /> : null}
      {/**
       * STABLE PARENT for `MainShellTabContentTransition` / `AppRouteTransition`.
       * DO NOT ternary-swap hub vs locked branches around the transition host —
       * `/stores/:slug` → `/cart` flips `hubScrollColumn` via viewport-lock and that
       * remount wiped enter animation (R3: store/product → cart RIGHT→LEFT missing).
       * Hub: Header+Body still share ONE push-surface via `hubChromeHeader`.
       * BottomNav stays outside (tx=0).
       */}
      <main
        className={
          hubScrollColumn
            ? "flex min-h-0 min-w-0 flex-1 flex-col"
            : `${mainSurfaceClass} ${mainBodyLockedClass} flex min-h-0 flex-1 flex-col`
        }
      >
        {mainBodyTransition}
      </main>
      <MarkInitialDestinationVisualReadyOnce pathname={pathname} />
      {showBottomNavMounted && !isDesktopSideRail ? (
        <BottomNavKeyboardHideProbe onStateChange={setBottomNavKeyboardState} />
      ) : null}
      {showBottomNavMounted ? (
        <BottomNav
          initialTabs={initialMainBottomNavItems}
          bodyPortal={isMessengerStackSurface}
          presentation={isDesktopSideRail ? "side-rail" : "bottom"}
          /** 키보드·스크롤로 숨긴 하단 탭은 누를 수도, 포커스로 닿을 수도 없게 (크롬 S4 B-04) */
          inert={bottomNavKeyboardHidden || bottomNavScrollHidden}
          extraOuterClassName={[
            bottomNavScrollHideEnabled || bottomNavKeyboardHidden
              ? resolveBottomNavScrollHideOuterClass(
                  bottomNavScrollHidden || bottomNavKeyboardHidden
                )
              : "",
            bottomNavKeyboardResized ? BOTTOM_NAV_KEYBOARD_RESIZED_CLASS : "",
            /**
             * Path-based (not JS matchMedia) — CSS `@media (min-width:768px)` owns width.
             * Avoids SSR false → full-width flash then shrink.
             * ≥768 split: BottomNav = left list pane only (APK/iOS/Windows/tablet 동일).
             * <768 phone: class present, media inactive → viewport 전폭.
             */
            !isDesktopSideRail &&
            (pathname === "/community-messenger" ||
              (pathname?.startsWith("/community-messenger/") ?? false))
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
      {f.showMainBottomNavFabSector &&
      !messengerCallSuppressesBottomNav &&
      !supportModalSuppressesBottomNav ? (
        <MainBottomNavFabSectorLazy />
      ) : null}
      <SupportModalHost />
      <SupportFabHostLazy />
      <GlobalPopupHostLazy />
      <BootThumbnailObserver />
    </div>
    </SupportFabRegistryProvider>
    </BottomNavScrollChromeProvider>
  );
}
