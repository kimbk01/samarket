import { shouldShowStrangerPeerNotice } from "@/lib/community-messenger/peer-notices";
import type { FriendshipDirection } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import type { PeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type PeerNoticeBranch =
  | "none"
  | "blocked"
  | "pending_incoming"
  | "pending_outgoing_hidden"
  | "stranger";

export function isPendingOutgoingFriendRequest(input: {
  friendshipDirection?: FriendshipDirection;
}): boolean {
  return input.friendshipDirection === "outgoing_pending";
}

export function isPendingIncomingFriendRequest(input: {
  friendshipDirection?: FriendshipDirection;
}): boolean {
  return input.friendshipDirection === "incoming_pending";
}

export function resolvePeerNoticeBranch(input: {
  isGeneralFriendDirect: boolean;
  roomType: string;
  peerUserId: string;
  blockedByMe: boolean;
  blockedByPeer: boolean;
  peerFriendshipState?: CommunityMessengerRoomSnapshot["peerFriendshipState"];
  friendshipDirection?: FriendshipDirection;
  /** Legacy display / stranger fallback only — not used for pending direction */
  peerRelationLabel: PeerRelationLabel;
}): PeerNoticeBranch {
  if (input.roomType !== "direct" || !input.peerUserId.trim() || !input.isGeneralFriendDirect) {
    return "none";
  }
  if (input.blockedByMe) return "blocked";
  if (isPendingOutgoingFriendRequest(input)) return "pending_outgoing_hidden";
  if (isPendingIncomingFriendRequest(input)) return "pending_incoming";
  if (input.friendshipDirection === "mutual_accepted") return "none";
  if (
    !shouldShowStrangerPeerNotice({
      relationLabel: input.peerRelationLabel,
      blockedByMe: input.blockedByMe,
      blockedByPeer: input.blockedByPeer,
    })
  ) {
    return "none";
  }
  return "stranger";
}
