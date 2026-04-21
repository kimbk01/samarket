/**
 * 1:1 음성/영상 **발신**이 연결되는 UI 표면 — 메인에 「통화」탭을 두지 않는 전제에서
 * 진입점이 흩어지지 않도록 유지한다.
 *
 * - `friendsFavoriteQuickActions` — 친구 탭 즐겨찾기 그리드의 빠른 음성/영상 (`MessengerFriendsScreen`)
 * - `friendProfileSheet` — 친구 프로필 시트 (`MessengerFriendProfileSheet` → `CommunityMessengerHome.startDirectCall`)
 * - `roomManaged` — 열린 채팅방·멤버 시트 등: `startOutgoingCallSessionAndOpen` 으로 `POST .../calls` 후 곧바로 `/community-messenger/calls/:sessionId`.
 *   (`/calls/outgoing` 은 딥링크·외부 공유용; 앱 내 발신은 이 URL을 거치지 않는다.)
 *
 * - `friendRowQuickPopup` — 친구 행 **⋮** 앵커 팝업(`MessengerFriendRowQuickPopup` → `CommunityMessengerHome.startDirectCall`)
 *
 * 수신 전용(발신 아님): `GlobalCommunityMessengerIncomingCall`
 *
 * 신규 발신 CTA 를 넣을 때는 위 표면 중 하나로만 연결하고, 여기 식별자·주석을 갱신한다.
 */
export const COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE = {
  friendsFavoriteQuickActions: "friends.favorite_quick_actions",
  friendProfileSheet: "friend.profile_sheet",
  roomManaged: "room.managed_call",
} as const;

export type CommunityMessengerOutgoingCallSurface =
  (typeof COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE)[keyof typeof COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE];
