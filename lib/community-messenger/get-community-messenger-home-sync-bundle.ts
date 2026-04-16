import type {
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  listCommunityMessengerFriendRequests,
  listCommunityMessengerFriends,
  listCommunityMessengerMyChatsAndGroups,
} from "@/lib/community-messenger/service";

/**
 * 홈 사일런트 갱신 — `GET /api/community-messenger/home-sync` 전용.
 * 구현은 `service.ts` 와 분리해 단일 왕복 경로만 얇게 유지한다(스트랭글러 1단계).
 */
export async function getCommunityMessengerHomeSyncBundle(userId: string): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  requests: CommunityMessengerFriendRequest[];
  friends: CommunityMessengerProfileLite[];
}> {
  const [roomsBlock, requests, friends] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId),
    listCommunityMessengerFriendRequests(userId),
    listCommunityMessengerFriends(userId),
  ]);
  return {
    chats: roomsBlock.chats,
    groups: roomsBlock.groups,
    requests,
    friends,
  };
}
