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
   * 참가자 브리지(`useMessageNotificationBridge`) 재생 모드 — 경로별 분리.
   * - 허브: `messengerSurface` 이고 `/community-messenger/rooms/[roomId]` 가 아님 → `full`(인앱 사운드·배너·데스크톱 등).
   * - 방: `f.isCommunityMessengerRoom` → `hub_sync_only` — participants Realtime·`cm.room.bump`·배지 리싱크는 동일,
   *   `full` 전용 분기(글로벌 사운드/배너/데스크톱 해석)만 축소 (`use-message-notification-bridge` 주석과 동일 계약).
   */
  const isCommunityMessengerHubPlayback = messengerSurface && !f.isCommunityMessengerRoom;
  const communityMessengerParticipantPlayback: MessageNotificationBridgePlayback =
    isCommunityMessengerHubPlayback ? "full" : "hub_sync_only";

  /** 방 화면은 대화 UI가 주 표면 — 허브용 인앱 배너 호스트는 마운트하지 않는다. */
  const mountMessengerInAppBannerHost =
    messengerRolloutShowsInAppMessageBanner() && isCommunityMessengerHubPlayback;

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
