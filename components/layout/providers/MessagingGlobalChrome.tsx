"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  resolveMessagingGlobalChromeFromPath,
  type MessagingGlobalChromePolicy,
} from "@/lib/layout/messaging-global-chrome-policy";
import {
  GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS,
  shouldIdleDeferGlobalIncomingFriendRequestHost,
} from "@/lib/layout/global-incoming-friend-request-host-mount-policy";
import { STORES_HOME_IDLE_DEFER_MS } from "@/lib/stores/stores-home-perf-marks";

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
/** 앱 안 알림 배너 — 메신저·회원 알림 단일 호스트 */
const InAppNotificationBannerHost = dynamic(
  () =>
    import("@/components/notifications/InAppNotificationBannerHost").then(
      (mod) => mod.InAppNotificationBannerHost
    ),
  { ssr: false }
);
const GlobalIncomingFriendRequestHost = dynamic(
  () =>
    import("@/components/community-messenger/GlobalIncomingFriendRequestHost").then(
      (mod) => mod.GlobalIncomingFriendRequestHost
    ),
  { ssr: false }
);
/**
 * 알림 배지 Realtime·인앱 배너·사운드 프라임.
 * 허브 snapshot 채팅음(GlobalOrderChatUnreadSound) 제거 — INSERT/participants 권위.
 * 메신저 `community_messenger_participants` 구독은 `MainShellMessengerParticipantBridge`(전역 1개)가 담당.
 */
export function MessagingGlobalChrome({ regionBarInLayout }: { regionBarInLayout: boolean }) {
  const pathname = usePathname();

  const resolved = useMemo(
    () => resolveMessagingGlobalChromeFromPath(pathname, regionBarInLayout),
    [pathname, regionBarInLayout]
  );

  const policyCacheRef = useRef<{ stableKey: string; policy: MessagingGlobalChromePolicy } | null>(null);
  if (!policyCacheRef.current || policyCacheRef.current.stableKey !== resolved.stableKey) {
    policyCacheRef.current = { stableKey: resolved.stableKey, policy: resolved.policy };
  }
  const p = policyCacheRef.current.policy;
  const pathBase = (pathname ?? "").split("?")[0] ?? "";
  const isStoresHubRoot = pathBase === "/stores" || pathBase === "/stores/";
  const [storesHubDeferredChrome, setStoresHubDeferredChrome] = useState(!isStoresHubRoot);

  useEffect(() => {
    if (!isStoresHubRoot) {
      setStoresHubDeferredChrome(true);
      return;
    }
    setStoresHubDeferredChrome(false);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setStoresHubDeferredChrome(true), { timeout: STORES_HOME_IDLE_DEFER_MS });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setStoresHubDeferredChrome(true), 0);
    return () => window.clearTimeout(t);
  }, [isStoresHubRoot]);

  useEffect(() => {
    const path = (pathname ?? "").split("?")[0] ?? "";
    if (path === "/community-messenger" || path.startsWith("/community-messenger/")) {
      void import("@/lib/community-messenger/preload-outgoing-call-modules").then((m) => {
        m.preloadOutgoingCallLaunchModules();
      });
    }
  }, [pathname]);

  /** Bundle6 — 중앙 친구 요청 팝업 Host. 통화 전용 화면만 제외. */
  const pathBaseForCall = (pathname ?? "").split("?")[0] ?? "";
  const isCommunityMessengerCallPage = Boolean(pathBaseForCall.match(/^\/community-messenger\/calls\/[^/]+$/));
  const mountFriendRequestHost = !isCommunityMessengerCallPage;
  const idleDeferFriendRequest = shouldIdleDeferGlobalIncomingFriendRequestHost(pathname);
  const [friendRequestHostReady, setFriendRequestHostReady] = useState(!idleDeferFriendRequest);

  useEffect(() => {
    if (!idleDeferFriendRequest) {
      setFriendRequestHostReady(true);
      return;
    }
    setFriendRequestHostReady(false);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setFriendRequestHostReady(true), {
        timeout: GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS,
      });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(
      () => setFriendRequestHostReady(true),
      GLOBAL_INCOMING_FRIEND_REQUEST_HOST_IDLE_DEFER_MS
    );
    return () => window.clearTimeout(t);
  }, [idleDeferFriendRequest, pathname]);

  if (
    !p.mountNotificationSoundPrime &&
    !p.mountNotificationsBadgeRealtimeBridge &&
    !p.mountMessengerInAppBannerHost &&
    !mountFriendRequestHost
  ) {
    return null;
  }

  const mountDeferredChrome = !isStoresHubRoot || storesHubDeferredChrome;

  return (
    <>
      {p.mountNotificationSoundPrime ? <NotificationSoundPrime /> : null}
      {p.mountNotificationsBadgeRealtimeBridge ? <NotificationsBadgeRealtimeBridge enabled /> : null}
      {mountDeferredChrome && (p.mountMessengerInAppBannerHost || p.mountNotificationsBadgeRealtimeBridge) ?
        <InAppNotificationBannerHost />
      : null}
      {friendRequestHostReady && mountFriendRequestHost ?
        <GlobalIncomingFriendRequestHost enabled />
      : null}
    </>
  );
}
