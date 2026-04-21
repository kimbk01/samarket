"use client";

import dynamic from "next/dynamic";
import { Suspense, useMemo } from "react";
import { usePathname } from "next/navigation";
import { HomeTradeHubFloatingBar } from "@/components/home/HomeTradeHubFloatingBar";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
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

  return (
    <div className={f.appShellRootClass}>
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      <MessagingGlobalChrome regionBarInLayout={regionBarInLayout} />
      <CallIncomingChrome />
      <WebConnectivityBanner />
      {f.showRegionBar && <RegionBar />}
      {f.showOwnerLiteStoreBar ? <OwnerLiteStoreBar /> : null}
      <main
        className={`${f.mainBottomClass} min-w-0 overflow-x-hidden ${
          f.isChatRoomDetail ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-hidden" : ""
        }`}
      >
        <div
          className={`${APP_MAIN_COLUMN_CLASS}${
            f.isChatRoomDetail ? " flex min-h-0 min-w-0 flex-1 flex-col" : ""
          }`}
        >
          {children}
        </div>
      </main>
      {f.showBottomNav ? (
        <Suspense
          fallback={
            <div className={BOTTOM_NAV_SHELL.outerClassName} aria-hidden>
              <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`} />
            </div>
          }
        >
          <BottomNav initialTabs={initialMainBottomNavItems} />
        </Suspense>
      ) : null}
      {f.showBottomNav && f.isTradeFloatingSurface ? <HomeTradeHubFloatingBar /> : null}
      {f.showFloat && <FloatingAddButton />}
    </div>
  );
}
