/**
 * 1:1 음성/영상 **발신**이 연결되는 UI 표면 — 메인에 「통화」탭을 두지 않는 전제에서
 * 진입점이 흩어지지 않도록 유지한다.
 *
 * - `friendsFavoriteQuickActions` — 친구 탭 즐겨찾기 그리드의 빠른 음성/영상 (`MessengerFriendsScreen`)
 * - `friendProfileSheet` — 친구 프로필 시트 (`MessengerFriendProfileSheet` → `CommunityMessengerHome.startDirectCall`)
 * - `roomManaged` — 열린 채팅방·멤버 시트 등 (`CommunityMessengerRoomClient` 가 `POST .../rooms/:id/calls` 호출)
 *
 * 친구 목록 **행 롱프레스 시트**(`MessengerFriendRowActionSheet`)에는 통화 버튼을 두지 않습니다. 통화는 프로필 시트·즐겨찾기·채팅방 관리 맥락으로만 연결합니다.
 *
 * 수신 전용(발신 아님): `GlobalCommunityMessengerIncomingCall`
 *
 * 신규 발신 CTA 를 넣을 때는 위 셋 중 하나로만 연결하고, 여기 식별자·주석을 갱신한다.
 */
export const COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE = {
  friendsFavoriteQuickActions: "friends.favorite_quick_actions",
  friendProfileSheet: "friend.profile_sheet",
  roomManaged: "room.managed_call",
} as const;

export type CommunityMessengerOutgoingCallSurface =
  (typeof COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE)[keyof typeof COMMUNITY_MESSENGER_OUTGOING_CALL_SURFACE];
