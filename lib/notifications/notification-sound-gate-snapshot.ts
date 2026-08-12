/**
 * Provider snapshot for sound settings / active room — not sound occurrence identity.
 */

export type NotificationSoundGateSnapshot = {
  userNotificationSettings: {
    trade_chat_enabled: boolean;
    community_chat_enabled: boolean;
    order_enabled: boolean;
    store_enabled: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
  };
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
