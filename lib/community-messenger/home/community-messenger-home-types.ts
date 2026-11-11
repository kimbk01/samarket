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

export type FriendSheetState = {
  mode: "profile";
  profile: CommunityMessengerProfileLite;
  /** @id 검색 등 — 친구 요청 CTA 비노출 */
  allowFriendRequest?: boolean;
  /**
   * 이 시트에서 [친구 추가]를 누르면 기록할 경로 — 아이디 검색 결과에서 열었으면 `id_search`,
   * 그 밖(목록·방·연락처 밖)은 `profile` (QR 친구 재감사 §2 ①-b: 검색에서 연 시트가 profile 로 섞였다).
   */
  friendAddSource?: "id_search" | "profile";
};
