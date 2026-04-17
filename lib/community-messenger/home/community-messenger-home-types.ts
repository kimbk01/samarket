import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type MessengerNotificationSettings = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

export type CommunityMessengerSettingsBackup = {
  version: 1;
  exportedAt: string;
  notificationSettings: MessengerNotificationSettings;
  incomingCallSoundEnabled: boolean;
  incomingCallBannerEnabled: boolean;
  localSettings: CommunityMessengerLocalSettings;
  recentSearches: string[];
  devices: {
    audioDeviceId: string | null;
    videoDeviceId: string | null;
  };
};

export type FriendSheetState = { mode: "profile"; profile: CommunityMessengerProfileLite };
