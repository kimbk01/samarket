import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { messengerRolloutShowsInAppMessageBanner } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import type { MessageNotificationBridgePlayback } from "@/lib/community-messenger/notifications/use-message-notification-bridge";

export type MessagingGlobalChromePolicy = {
  /** `notifications` 테이블 Realtime — 메신저 참가자 브리지는 `MainShellMessengerParticipantBridge` 가 전역 단일로 담당 */
  mountNotificationsBadgeRealtimeBridge: boolean;
  mountGlobalOrderChatUnreadSound: boolean;
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
  /**
   * 상단 알림 벨 Realtime — `mountGlobalRealtimeChrome` 만 켜면 `/community`·`/market` 등에서 구독이 꺼진다.
   * 메신저 participants 는 `MainShellMessengerParticipantBridge` 가 항상 켜므로 여기서는 알림 테이블만 확장한다.
   */
  /**
   * 알림 INSERT/UPDATE Realtime 는 화면 위치와 무관하게 항상 살아 있어야
   * (친구/메신저/거래 포함) 어디서든 벨/뱃지 동기화가 끊기지 않는다.
   * 통화 전용 화면만 예외로 두어 통화 UI 집중도를 유지한다.
   */
  const mountMainShellNotificationsRealtime = !f.isCommunityMessengerCallPage;

  /**
   * 참가자 브리지 재생 모드 — 경로별 분리.
   * - 허브: `full`.
   * - 그 외: `hub_sync_only` (Realtime·뱃지·bump·list·increase 음 동일).
   * 인앱 배너 호스트는 통화 화면 제외 전역 — 마켓에서도 participants 와 같은 턴에 표시.
   */
  const isCommunityMessengerHubPlayback = messengerSurface && !f.isCommunityMessengerRoom;
  const communityMessengerParticipantPlayback: MessageNotificationBridgePlayback =
    isCommunityMessengerHubPlayback ? "full" : "hub_sync_only";

  const mountMessengerInAppBannerHost =
    messengerRolloutShowsInAppMessageBanner() && !f.isCommunityMessengerCallPage;

  const stableKey = [
    f.mountGlobalRealtimeChrome ? "1" : "0",
    mountMainShellNotificationsRealtime ? "1" : "0",
    f.mountNotificationSoundPrime ? "1" : "0",
    communityMessengerParticipantPlayback,
    mountMessengerInAppBannerHost ? "1" : "0",
  ].join("|");

  const policy: MessagingGlobalChromePolicy = {
    mountNotificationsBadgeRealtimeBridge: mountMainShellNotificationsRealtime,
    mountGlobalOrderChatUnreadSound: f.mountGlobalRealtimeChrome,
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
