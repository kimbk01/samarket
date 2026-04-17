"use client";

import dynamic from "next/dynamic";

/** 메신저 홈 시트·모달 — 코드 분할 경계만 이 파일에 둔다(`CommunityMessengerHome` 본문 축소). */
export const MessengerFriendProfileSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerFriendProfileSheet").then((m) => m.MessengerFriendProfileSheet),
  { ssr: false, loading: () => null }
);
export const MessengerChatRoomActionSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerChatRoomActionSheet").then((m) => m.MessengerChatRoomActionSheet),
  { ssr: false, loading: () => null }
);
export const MessengerFriendsPrivacySheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerFriendsPrivacySheet").then((m) => m.MessengerFriendsPrivacySheet),
  { ssr: false, loading: () => null }
);
export const MessengerSearchSheet = dynamic(
  () => import("@/components/community-messenger/MessengerSearchSheet").then((m) => m.MessengerSearchSheet),
  { ssr: false, loading: () => null }
);
export const MessengerNewConversationSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerNewConversationSheet").then(
      (m) => m.MessengerNewConversationSheet
    ),
  { ssr: false, loading: () => null }
);
export const MessengerFriendAddSheet = dynamic(
  () => import("@/components/community-messenger/MessengerFriendAddSheet").then((m) => m.MessengerFriendAddSheet),
  { ssr: false, loading: () => null }
);
export const MessengerNotificationCenterSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerNotificationCenterSheet").then(
      (m) => m.MessengerNotificationCenterSheet
    ),
  { ssr: false, loading: () => null }
);
export const MessengerSettingsSheet = dynamic(
  () => import("@/components/community-messenger/MessengerSettingsSheet").then((m) => m.MessengerSettingsSheet),
  { ssr: false, loading: () => null }
);
