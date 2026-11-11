"use client";

import dynamic from "next/dynamic";

/**
 * 메신저 홈 시트·모달 — 코드 분할 경계만 이 파일에 둔다(`CommunityMessengerHome` 본문 축소).
 * 「새 대화」 시트는 여기 두지 않는다 — 누르자마자 열려야 해서 홈이 정적으로 불러 둔다(채팅 시안 4판 「5」).
 * 채팅 설정·채팅 검색은 시트가 아니라 하위 화면이다(`MessengerHomeSubScreenHost`).
 */
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
export const MessengerNotificationCenterSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerNotificationCenterSheet").then(
      (m) => m.MessengerNotificationCenterSheet
    ),
  { ssr: false, loading: () => null }
);
