import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { messengerRolloutShowsInAppMessageBanner } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import type { MessageNotificationBridgePlayback } from "@/lib/community-messenger/notifications/use-message-notification-bridge";

export type MessagingGlobalChromePolicy = {
  mountNotificationsBadgeRealtimeBridge: boolean;
  mountGlobalOrderChatUnreadSound: boolean;
  mountGlobalCommunityMessengerParticipantBridge: boolean;
  communityMessengerParticipantPlayback: MessageNotificationBridgePlayback;
  mountNotificationSoundPrime: boolean;
  mountMessengerInAppBannerHost: boolean;
};

/**
 * `resolveConditionalAppShellFlags` 는 **한 번만** 호출해 정책 객체와 안정 키를 같이 만든다.
 * (`MessagingGlobalChrome` 에서 stableKey 가 같을 때 policy 참조를 유지할 때 사용)
 */
export function resolveMessagingGlobalChromeFromPath(
  pathname: string | null,
  regionBarInLayout: boolean
): { stableKey: string; policy: MessagingGlobalChromePolicy } {
  const f = resolveConditionalAppShellFlags(pathname, regionBarInLayout);
  const messengerSurface = f.isCommunityMessengerSurface && !f.isCommunityMessengerCallPage;
  const communityMessengerParticipantPlayback: MessageNotificationBridgePlayback = messengerSurface
    ? "full"
    : "hub_sync_only";
  const mountMessengerInAppBannerHost = messengerRolloutShowsInAppMessageBanner() && messengerSurface;
  const stableKey = [
    f.mountGlobalRealtimeChrome ? "1" : "0",
    f.mountNotificationSoundPrime ? "1" : "0",
    communityMessengerParticipantPlayback,
    mountMessengerInAppBannerHost ? "1" : "0",
  ].join("|");

  const policy: MessagingGlobalChromePolicy = {
    mountNotificationsBadgeRealtimeBridge: f.mountGlobalRealtimeChrome,
    mountGlobalOrderChatUnreadSound: f.mountGlobalRealtimeChrome,
    mountGlobalCommunityMessengerParticipantBridge: f.mountGlobalRealtimeChrome,
    communityMessengerParticipantPlayback,
    mountNotificationSoundPrime: f.mountNotificationSoundPrime,
    mountMessengerInAppBannerHost,
  };

  return { stableKey, policy };
}

/**
 * 메신저 방 A↔B 등 정책 결과가 같을 때 키만 비교할 때 사용 (내부적으로 단일 shell resolve).
 */
export function messagingGlobalChromePolicyStableKey(
  pathname: string | null,
  regionBarInLayout: boolean
): string {
  return resolveMessagingGlobalChromeFromPath(pathname, regionBarInLayout).stableKey;
}

export function resolveMessagingGlobalChromePolicy(
  pathname: string | null,
  regionBarInLayout: boolean
): MessagingGlobalChromePolicy {
  return resolveMessagingGlobalChromeFromPath(pathname, regionBarInLayout).policy;
}
