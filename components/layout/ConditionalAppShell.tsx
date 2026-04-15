"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { HomeTradeHubFloatingBar } from "@/components/home/HomeTradeHubFloatingBar";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { RegionBar } from "./RegionBar";
import { BottomNav } from "./BottomNav";
import { FloatingAddButton } from "./FloatingAddButton";
import { OwnerLiteStoreBar } from "./OwnerLiteStoreBar";

const NotificationSoundPrime = dynamic(
  () => import("@/components/notifications/NotificationSoundPrime").then((mod) => mod.NotificationSoundPrime),
  { ssr: false }
);
const NotificationsBadgeRealtimeBridge = dynamic(
  () =>
    import("@/components/notifications/NotificationsBadgeRealtimeBridge").then(
      (mod) => mod.NotificationsBadgeRealtimeBridge
    ),
  { ssr: false }
);
const GlobalOrderChatUnreadSound = dynamic(
  () => import("@/components/notifications/GlobalOrderChatUnreadSound").then((mod) => mod.GlobalOrderChatUnreadSound),
  { ssr: false }
);
const PhilifeFeedWarmPrefetch = dynamic(
  () => import("@/components/community/PhilifeFeedWarmPrefetch").then((mod) => mod.PhilifeFeedWarmPrefetch),
  { ssr: false }
);
const GlobalCommunityMessengerUnreadSound = dynamic(
  () =>
    import("@/components/community-messenger/GlobalCommunityMessengerUnreadSound").then(
      (mod) => mod.GlobalCommunityMessengerUnreadSound
    ),
  { ssr: false }
);
const IncomingCallOverlay = dynamic(
  () =>
    import("@/components/community-messenger/IncomingCallOverlay").then((mod) => mod.IncomingCallOverlay),
  { ssr: false }
);
const WebConnectivityBanner = dynamic(
  () => import("@/components/layout/WebConnectivityBanner").then((mod) => mod.WebConnectivityBanner),
  { ssr: false }
);

export function ConditionalAppShell({
  children,
  regionBarInLayout = false,
}: {
  children: React.ReactNode;
  /** true면 **메인 1단**(`RegionBar`)는 `AppStickyHeader`에서만 렌더 — 여기서 중복 삽입 안 함 (`lib/layout/main-tier1.ts`) */
  regionBarInLayout?: boolean;
}) {
  const pathname = usePathname();
  const f = resolveConditionalAppShellFlags(pathname, regionBarInLayout);

  return (
    <div className={f.appShellRootClass}>
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      {f.mountNotificationSoundPrime ? <NotificationSoundPrime /> : null}
      {f.mountGlobalRealtimeChrome ? <NotificationsBadgeRealtimeBridge /> : null}
      {f.mountGlobalRealtimeChrome ? <GlobalOrderChatUnreadSound /> : null}
      {f.mountGlobalRealtimeChrome ? <GlobalCommunityMessengerUnreadSound /> : null}
      {!f.suppressIncomingCallOverlay ? <IncomingCallOverlay /> : null}
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
      {f.showBottomNav && <BottomNav />}
      {f.showBottomNav && f.isTradeFloatingSurface ? <HomeTradeHubFloatingBar /> : null}
      {f.showFloat && <FloatingAddButton />}
    </div>
  );
}
