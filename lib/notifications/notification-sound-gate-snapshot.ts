/**
 * Provider snapshot for sound settings / active room — not sound occurrence identity.
 */

import type {
  LegacyUserSettingsPushRow,
  NotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

export type NotificationSoundGateSnapshot = {
  userNotificationSettings: {
    trade_chat_enabled: boolean;
    community_chat_enabled: boolean;
    order_enabled: boolean;
    store_enabled: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
  };
  /** Raw storage inputs — re-normalized at decision time for quiet.activeNow. */
  memberPreferenceStorage?: Readonly<{
    notificationSettingsRow: NotificationSettingsStorageRow | null;
    legacyUserSettingsRow: LegacyUserSettingsPushRow | null;
  }>;
  activeTradeChatRoomId: string | null;
  activeCommunityChatRoomId: string | null;
  activeGroupChatRoomId: string | null;
  isWindowFocused: boolean;
};

let gateSnapshot: NotificationSoundGateSnapshot | null = null;

export function syncNotificationSoundGateSnapshot(next: NotificationSoundGateSnapshot | null): void {
  gateSnapshot = next;
}

export function getNotificationSoundGateSnapshot(): NotificationSoundGateSnapshot | null {
  return gateSnapshot;
}
