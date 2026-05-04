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
import { homeSyncBreakdownEnabled, logHomeSyncBreakdown } from "@/lib/community-messenger/home-sync-breakdown-log";

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
  const tBundle = performance.now();
  if (tier === "critical") {
    const roomsBlock = await listCommunityMessengerMyChatsAndGroups(userId, { tier: "critical" });
    if (homeSyncBreakdownEnabled()) {
      logHomeSyncBreakdown("get_home_sync_bundle_critical_wall_ms", performance.now() - tBundle, {
        tier: "critical",
      });
    }
    return {
      chats: roomsBlock.chats,
      groups: roomsBlock.groups,
      requests: [],
      friends: [],
    };
  }
  const tPar = performance.now();
  const [roomsBlock, requests, friends] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId, { tier: "full" }),
    listCommunityMessengerFriendRequests(userId),
    listCommunityMessengerFriends(userId),
  ]);
  if (homeSyncBreakdownEnabled()) {
    logHomeSyncBreakdown("get_home_sync_bundle_full_parallel_wall_ms", performance.now() - tPar, {
      tier: "full",
      paths: "roomsBlock + friendRequests + friends",
    });
    logHomeSyncBreakdown("get_home_sync_bundle_full_total_wall_ms", performance.now() - tBundle, {
      tier: "full",
    });
  }
  return {
    chats: roomsBlock.chats,
    groups: roomsBlock.groups,
    requests,
    friends,
  };
}
