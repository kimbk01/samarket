"use client";

import dynamic from "next/dynamic";
import { Suspense, useMemo } from "react";
import { usePathname } from "next/navigation";
import { HomeTradeHubFloatingBar } from "@/components/home/HomeTradeHubFloatingBar";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import {
  isCommunityMessengerRoomPathname,
  resolveConditionalAppShellFlags,
} from "@/lib/layout/conditional-app-shell-flags";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import {
  resolveBottomNavScrollHideEnabled,
  useBottomNavScrollHide,
} from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import { isMessengerFromHeaderStackSurface } from "@/lib/layout/messenger-from-header-stack-surface";
import { useMessengerUIStore } from "@/lib/community-messenger/stores/useMessengerUIStore";
import { BOTTOM_NAV_SHELL } from "@/lib/main-menu/bottom-nav-config";
import { CallIncomingChrome } from "@/components/layout/providers/CallIncomingChrome";
import { MessagingGlobalChrome } from "@/components/layout/providers/MessagingGlobalChrome";
import { RegionBar } from "./RegionBar";
import { BottomNav } from "./BottomNav";
import { FloatingAddButton } from "./FloatingAddButton";
import { OwnerLiteStoreBar } from "./OwnerLiteStoreBar";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const PhilifeFeedWarmPrefetch = dynamic(
  () => import("@/components/community/PhilifeFeedWarmPrefetch").then((mod) => mod.PhilifeFeedWarmPrefetch),
  { ssr: false }
);
const WebConnectivityBanner = dynamic(
  () => import("@/components/layout/WebConnectivityBanner").then((mod) => mod.WebConnectivityBanner),
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
  const f = useMemo(
    () => resolveConditionalAppShellFlags(pathname, regionBarInLayout),
    [pathname, regionBarInLayout]
  );
  const { isOpen: headerMessengerFromPhilife } = usePhilifeHeaderMessengerStack();
  const pathNoQuery = pathname?.split("?")[0] ?? "";
  const isMessengerStackSurface = isMessengerFromHeaderStackSurface(pathNoQuery);
  const messengerSuppressBottomNav = useMessengerUIStore((s) => s.messengerSuppressBottomNavForKeyboard);
  const messengerRoomKeyboardHidesNav =
    isCommunityMessengerRoomPathname(pathname) && messengerSuppressBottomNav;
  const showBottomNavBase = f.showBottomNav && !messengerRoomKeyboardHidesNav;
  /** 헤더 메신저 풀스택이 열리면 본문과 함께 밀리지 않도록 탭 숨김 — `/philife`·거래 홈·마켓 동일 */
  const showBottomNavEffective =
    showBottomNavBase && !(isMessengerStackSurface && headerMessengerFromPhilife);
  const bottomNavScrollHideEnabled =
    showBottomNavEffective && resolveBottomNavScrollHideEnabled(pathNoQuery, headerMessengerFromPhilife);
  const bottomNavHiddenByScroll = useBottomNavScrollHide(Boolean(bottomNavScrollHideEnabled));
  const chatDetailUsesZeroBottomPadding =
    f.isChatRoomDetail && (!f.isCommunityMessengerRoom || f.isCommunityMessengerCallPage);
  const mainBottomClassEffective =
    messengerRoomKeyboardHidesNav && !chatDetailUsesZeroBottomPadding
      ? "pb-0"
      : f.mainBottomClass;

  return (
    <div className={`${f.appShellRootClass} min-h-dvh bg-sam-app`}>
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      <MessagingGlobalChrome regionBarInLayout={regionBarInLayout} />
      <CallIncomingChrome />
      <WebConnectivityBanner />
      {f.showRegionBar && <RegionBar />}
      {f.showOwnerLiteStoreBar ? <OwnerLiteStoreBar /> : null}
      <main
        className={`${mainBottomClassEffective} min-w-0 overflow-x-hidden bg-sam-app ${
          f.isChatRoomDetail ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-hidden" : ""
        }`}
      >
        <div
          className={`${APP_MAIN_COLUMN_CLASS} ${
            f.isChatRoomDetail ? " flex min-h-0 min-w-0 flex-1 flex-col" : ""
          }`}
        >
          {children}
        </div>
      </main>
      {showBottomNavEffective ? (
        <Suspense
          fallback={
            <div className={BOTTOM_NAV_SHELL.outerClassName} aria-hidden>
              <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`} />
            </div>
          }
        >
          <BottomNav
            initialTabs={initialMainBottomNavItems}
            bodyPortal={isMessengerStackSurface}
            extraOuterClassName={
              bottomNavScrollHideEnabled
                ? bottomNavHiddenByScroll
                  ? "translate-y-full"
                  : "translate-y-0"
                : ""
            }
          />
        </Suspense>
      ) : null}
      {showBottomNavEffective && f.isTradeFloatingSurface ? <HomeTradeHubFloatingBar /> : null}
      {f.showFloat && <FloatingAddButton />}
    </div>
  );
}
