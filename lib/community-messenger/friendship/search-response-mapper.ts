import type { CommunityMessengerPeerRelationStatus } from "@/lib/community-messenger/types";
import { batchResolveCommunityMessengerFriendshipStatus } from "@/lib/community-messenger/friendship/friendship-resolver";
import type { CommunityMessengerFriendshipState } from "@/lib/community-messenger/friendship/types";
import { trimFriendshipText } from "@/lib/community-messenger/friendship/friendship-utils";

export type FriendshipSearchGuardFields = {
  isFriend: boolean;
  isBlockedByMe: boolean;
  isBlockedByPeer: boolean;
  relationshipStatus: CommunityMessengerPeerRelationStatus;
  friendshipStatus: CommunityMessengerFriendshipState["friendshipStatus"];
  friendshipId: string | null;
  readdBlockedUntil: string | null;
  canMessage: boolean;
  canCall: boolean;
  canSendFriendRequest: boolean;
  requestRoomId?: string | null;
  requestMessageId?: string | null;
};

export function mapFriendshipStateToSearchGuard(
  state: CommunityMessengerFriendshipState
): FriendshipSearchGuardFields {
  return {
    isFriend: state.isFriend,
    isBlockedByMe: state.isBlockedByMe,
    isBlockedByPeer: state.isBlockedByPeer,
    relationshipStatus: state.status,
    friendshipStatus: state.friendshipStatus,
    friendshipId: state.friendshipId,
    readdBlockedUntil: state.readdBlockedUntil,
    canMessage: state.canMessage,
    canCall: state.canCall,
    canSendFriendRequest: state.canAddFriend,
    requestRoomId: state.requestRoomId,
    requestMessageId: state.requestMessageId,
  };
}

export async function batchResolveSearchGuards(
  viewerUserId: string,
  peerUserIds: string[]
): Promise<Map<string, FriendshipSearchGuardFields>> {
  const viewer = trimFriendshipText(viewerUserId);
  const states = await batchResolveCommunityMessengerFriendshipStatus(viewer, peerUserIds);
  const out = new Map<string, FriendshipSearchGuardFields>();
  for (const [peerId, state] of states) {
    out.set(peerId, mapFriendshipStateToSearchGuard(state));
  }
  return out;
}
