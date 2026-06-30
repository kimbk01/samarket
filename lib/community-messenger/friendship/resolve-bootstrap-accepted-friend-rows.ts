import { peekBootstrapLiteSocialDeferred } from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import {
  type CommunityFriendRequestAcceptedRow,
  peerIdFromCommunityFriendAcceptedRow,
  unionCommunityFriendAcceptedRowsByPeer,
} from "@/lib/community-messenger/friendship/community-messenger-friend-accepted-list";

/**
 * Full bootstrap snapshot RPC `social_graph.accepted_friends` 는 DB migration 단계에 따라
 * SSOT `community_messenger_friendships` 보다 늦을 수 있다.
 * accept 직후 primed deferred cache · live SSOT fetch 로 RPC 위에 overlay 한다.
 */
export async function resolveBootstrapAcceptedFriendRows(
  userId: string,
  rpcAcceptedRows: readonly CommunityFriendRequestAcceptedRow[]
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const rpcRows = [...rpcAcceptedRows];
  const peek = peekBootstrapLiteSocialDeferred(userId);
  if (peek.snapshot?.acceptedFriendRows?.length) {
    return unionCommunityFriendAcceptedRowsByPeer(userId, rpcRows, peek.snapshot.acceptedFriendRows);
  }

  const { fetchBootstrapLiteSocialGraphSnapshot } = await import("@/lib/community-messenger/service");
  const live = await fetchBootstrapLiteSocialGraphSnapshot(userId);
  const liveRows = live.acceptedFriendRows ?? [];
  if (!liveRows.length) return rpcRows;
  return unionCommunityFriendAcceptedRowsByPeer(userId, rpcRows, liveRows);
}
