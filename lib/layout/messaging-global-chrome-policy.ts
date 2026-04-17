import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { messengerRolloutShowsInAppMessageBanner } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import type { MessageNotificationBridgePlayback } from "@/lib/community-messenger/notifications/use-message-notification-bridge";

/**
 * `MessagingGlobalChrome` 전용 — 알림 배지 Realtime·주문 허브 미읽음 사운드·메신저 participants 브리지·
 * 인앱 배너 호스트·사운드 프라임 마운트를 한곳에서 계산한다.
 *
 * `resolveConditionalAppShellFlags` 와 동일 pathname 규칙을 쓰되, 역할별 플래그만 노출한다.
 */
export type MessagingGlobalChromePolicy = {
  mountNotificationsBadgeRealtimeBridge: boolean;
  mountGlobalOrderChatUnreadSound: boolean;
  mountGlobalCommunityMessengerParticipantBridge: boolean;
  communityMessengerParticipantPlayback: MessageNotificationBridgePlayback;
  mountNotificationSoundPrime: boolean;
  mountMessengerInAppBannerHost: boolean;
};

export function resolveMessagingGlobalChromePolicy(
  pathname: string | null,
  regionBarInLayout: boolean
): MessagingGlobalChromePolicy {
  const f = resolveConditionalAppShellFlags(pathname, regionBarInLayout);
  const messengerSurface = f.isCommunityMessengerSurface && !f.isCommunityMessengerCallPage;
  const communityMessengerParticipantPlayback: MessageNotificationBridgePlayback = messengerSurface
    ? "full"
    : "hub_sync_only";

  return {
    mountNotificationsBadgeRealtimeBridge: f.mountGlobalRealtimeChrome,
    mountGlobalOrderChatUnreadSound: f.mountGlobalRealtimeChrome,
    mountGlobalCommunityMessengerParticipantBridge: f.mountGlobalRealtimeChrome,
    communityMessengerParticipantPlayback,
    mountNotificationSoundPrime: f.mountNotificationSoundPrime,
    mountMessengerInAppBannerHost: messengerRolloutShowsInAppMessageBanner() && messengerSurface,
  };
}
