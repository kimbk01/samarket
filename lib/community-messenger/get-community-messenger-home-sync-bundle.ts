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
export async function getCommunityMessengerHomeSyncBundle(
  userId: string,
  tier: "critical" | "full" = "full"
): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  requests: CommunityMessengerFriendRequest[];
  friends: CommunityMessengerProfileLite[];
}> {
  if (tier === "critical") {
    const roomsBlock = await listCommunityMessengerMyChatsAndGroups(userId, { tier: "critical" });
    return {
      chats: roomsBlock.chats,
      groups: roomsBlock.groups,
      requests: [],
      friends: [],
    };
  }
  const [roomsBlock, requests, friends] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId, { tier: "full" }),
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
