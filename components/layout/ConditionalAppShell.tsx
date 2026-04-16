"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { HomeTradeHubFloatingBar } from "@/components/home/HomeTradeHubFloatingBar";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { messengerRolloutShowsInAppMessageBanner } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
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
const MessengerInAppMessageBannerHost = dynamic(
  () =>
    import("@/components/community-messenger/MessengerInAppMessageBannerHost").then(
      (mod) => mod.MessengerInAppMessageBannerHost
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
  const f = useMemo(
    () => resolveConditionalAppShellFlags(pathname, regionBarInLayout),
    [pathname, regionBarInLayout]
  );

  return (
    <div className={f.appShellRootClass}>
      {f.mountPhilifeWarmPrefetch ? <PhilifeFeedWarmPrefetch /> : null}
      {f.mountNotificationSoundPrime ? <NotificationSoundPrime /> : null}
      {/**
       * 구조적 해결: 라우트 전환마다 언마운트→재마운트로 WS 재구독/부트스트랩이 반복되면
       * “메신저 탭 선택/페이지 이동이 계속 느려지는” 체감이 누적된다.
       * 컴포넌트는 항상 마운트하고 내부 구독만 enabled 게이트로 제어해 재마운트 비용을 제거한다.
       */}
      <NotificationsBadgeRealtimeBridge enabled={f.mountGlobalRealtimeChrome} />
      <GlobalOrderChatUnreadSound enabled={f.mountGlobalRealtimeChrome} />
      <GlobalCommunityMessengerUnreadSound enabled={f.mountGlobalRealtimeChrome} />
      {messengerRolloutShowsInAppMessageBanner() ? (
        <MessengerInAppMessageBannerHost />
      ) : null}
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
