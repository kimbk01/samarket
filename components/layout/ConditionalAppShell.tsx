"use client";

import dynamic from "next/dynamic";
import { Suspense, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import {
  resolveBottomNavScrollHideEnabled,
  useBottomNavScrollHide,
} from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";
import {
  BOTTOM_NAV_SHELL,
  resolveBottomNavScrollHideOuterClass,
} from "@/lib/main-menu/bottom-nav-config";
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
  MAIN_HUB_SCROLL_SHELL_ROOT_CLASS,
  resolvesMainHubScrollColumn,
} from "@/lib/layout/main-hub-scroll-column";
import { MainHubScrollColumn } from "./MainHubScrollColumn";
import { invalidateMainAppScrollRootCache } from "@/lib/layout/main-app-scroll-root";
import { logDevSafeModeProbeOnce } from "@/lib/dev/is-dev-safe-mode";
import {
  getStoreOwnerMainBottomNavSuppressed,
  subscribeStoreOwnerMainBottomNavSuppressed,
} from "@/lib/business/store-owner-main-bottom-nav-suppress";
import { MessagingGlobalChrome } from "@/components/layout/providers/MessagingGlobalChrome";
import { CommunityMessengerRoomOpeningOverlayHost } from "@/components/community-messenger/room/CommunityMessengerRoomOpeningOverlayHost";
import { AppStickyHeader } from "./AppStickyHeader";
import { RegionBar } from "./RegionBar";
import { BottomNav } from "./BottomNav";
import { MainShellTabContentTransition } from "./MainShellTabContentTransition";
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
/** 오너 라이트 상단 바 서브그래프만 별도 청크 — 표시 조건·DOM 위치·모달 계약 동일. */
const OwnerLiteStoreBarLazy = dynamic(
  () => import("@/components/layout/OwnerLiteStoreBar").then((m) => m.OwnerLiteStoreBar),
  { ssr: false }
);
/** 글로벌 FAB(+ 글쓰기) 서브그래프만 별도 청크 — `f.showFloat`·DOM 위치 동일. */
const FloatingAddButtonLazy = dynamic(
  () => import("@/components/layout/FloatingAddButton").then((m) => m.FloatingAddButton),
  { ssr: false }
);
const MainBottomNavFabSectorLazy = dynamic(
  () => import("@/components/layout/MainBottomNavFabSector").then((m) => m.MainBottomNavFabSector),
  { ssr: false }
);

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
  const storeOwnerFlyoutSuppressesBottomNav = useSyncExternalStore(
    subscribeStoreOwnerMainBottomNavSuppressed,
    getStoreOwnerMainBottomNavSuppressed,
    () => false
  );
  const mainBottomClassLive = useMemo(() => {
    if (!storeOwnerFlyoutSuppressesBottomNav) return f.mainBottomClass;
    if (f.isChatRoomDetail || f.isCommunityMessengerSurface || f.isTradeMeetSpotPickRoute) {
      return f.mainBottomClass;
    }
    return "pb-4";
  }, [storeOwnerFlyoutSuppressesBottomNav, f]);
  const { isOpen: headerMessengerFromPhilife } = usePhilifeHeaderMessengerStack();
  const pathNoQuery = pathname?.split("?")[0] ?? "";
  const isMessengerStackSurface = isMessengerFromHeaderStackSurface(pathNoQuery);
  const showBottomNavBase = f.showBottomNav;
  /** 헤더 메신저 풀스택이 열리면 본문과 함께 밀리지 않도록 탭 숨김 — `/philife`·거래(`/market*`) 동일 */
  const showBottomNavEffective =
    showBottomNavBase &&
    !(isMessengerStackSurface && headerMessengerFromPhilife) &&
    !storeOwnerFlyoutSuppressesBottomNav;
  const bottomNavScrollHideEnabled =
    showBottomNavEffective && resolveBottomNavScrollHideEnabled(pathNoQuery, headerMessengerFromPhilife);
  const bottomNavHiddenByScroll = useBottomNavScrollHide(Boolean(bottomNavScrollHideEnabled));
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
  const mainShellInnerRootClass = mainScrollInMainColumn
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
  const mainColumnInner = (
    <div
      className={`${APP_MAIN_COLUMN_CLASS} ${
        f.isMainColumnViewportLocked ? " flex min-h-0 min-w-0 flex-1 flex-col" : ""
      }`}
    >
      <MainShellTabContentTransition
        initialNavItems={initialMainBottomNavItems}
        contentStretchClass={
          f.isMainColumnViewportLocked || f.isStoreOwnerAdminRoute
            ? "flex h-full min-h-0 min-w-0 flex-1 flex-col"
            : "min-w-0"
        }
      >
        {children}
      </MainShellTabContentTransition>
    </div>
  );
  return (
    /** 허브: `MainHubScrollColumn` + `app-shell.css` `.main-hub-scroll-*` — 1단 고정·본문 단일 스크롤 */
    <div
      className={`app-shell w-full min-w-0 ${
        hubScrollColumn ? MAIN_HUB_SCROLL_SHELL_ROOT_CLASS : mainShellInnerRootClass
      } ${hubScrollColumn && !heroMenuSurface ? "bg-sam-app" : ""}`}
    >
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      <MessagingGlobalChrome regionBarInLayout={regionBarInLayout} />
      <CommunityMessengerRoomOpeningOverlayHost />
      <WebConnectivityBanner />
      {f.showRegionBar ? <RegionBar /> : null}
      {f.showOwnerLiteStoreBar ? <OwnerLiteStoreBarLazy /> : null}
      {hubScrollColumn ? (
        <MainHubScrollColumn header={<AppStickyHeader />} mainClassName={mainSurfaceClass}>
          {mainColumnInner}
        </MainHubScrollColumn>
      ) : (
        <main className={`${mainSurfaceClass} ${mainBodyLockedClass}`}>{mainColumnInner}</main>
      )}
      {showBottomNavEffective ? (
        <Suspense
          fallback={
            <div className={BOTTOM_NAV_SHELL.outerClassName} aria-hidden>
              <div className={BOTTOM_NAV_SHELL.innerBarClassName}>
                <div className={`${BOTTOM_NAV_SHELL.containerClassName} ${BOTTOM_NAV_SHELL.heightClass}`} />
              </div>
            </div>
          }
        >
          <BottomNav
            initialTabs={initialMainBottomNavItems}
            bodyPortal={isMessengerStackSurface}
            extraOuterClassName={
              bottomNavScrollHideEnabled ?
                resolveBottomNavScrollHideOuterClass(bottomNavHiddenByScroll)
              : ""
            }
          />
        </Suspense>
      ) : null}
      {showBottomNavEffective && f.showHomeTradeHubFloatingBar ? <HomeTradeHubFloatingBarLazy /> : null}
      {f.showMainBottomNavFabSector ? <MainBottomNavFabSectorLazy /> : null}
      {f.showFloat && <FloatingAddButtonLazy />}
    </div>
  );
}
