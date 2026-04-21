"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  resolveMessagingGlobalChromeFromPath,
  type MessagingGlobalChromePolicy,
} from "@/lib/layout/messaging-global-chrome-policy";

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
const MessengerInAppMessageBannerHost = dynamic(
  () =>
    import("@/components/community-messenger/MessengerInAppMessageBannerHost").then(
      (mod) => mod.MessengerInAppMessageBannerHost
    ),
  { ssr: false }
);

/**
 * 알림 배지 Realtime·주문 허브 미읽음 사운드·인앱 배너·사운드 프라임.
 * 메신저 `community_messenger_participants` 구독은 `MainShellMessengerParticipantBridge`(전역 1개)가 담당.
 * 마운트 기준은 `resolveMessagingGlobalChromeFromPath` 단일 정책(셸 플래그 1회 계산).
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

  if (
    !p.mountNotificationSoundPrime &&
    !p.mountNotificationsBadgeRealtimeBridge &&
    !p.mountGlobalOrderChatUnreadSound &&
    !p.mountMessengerInAppBannerHost
  ) {
    return null;
  }

  return (
    <>
      {p.mountNotificationSoundPrime ? <NotificationSoundPrime /> : null}
      {p.mountNotificationsBadgeRealtimeBridge ? <NotificationsBadgeRealtimeBridge enabled /> : null}
      {p.mountGlobalOrderChatUnreadSound ? <GlobalOrderChatUnreadSound enabled /> : null}
      {p.mountMessengerInAppBannerHost ? <MessengerInAppMessageBannerHost /> : null}
    </>
  );
}
