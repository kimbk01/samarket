/**
 * Room client — friendship Realtime / social_sync → snapshot refresh.
 */

import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { DirectCallGateSnapshot } from "@/lib/community-messenger/direct-call-permission";

export type FriendshipSyncEventStatus = "pending" | "accepted" | "blocked" | "removed";

export function shouldRefreshRoomOnFriendshipEvent(input: {
  viewerUserId: string;
  peerUserId: string;
  requesterUserId: string;
  addresseeUserId: string;
  status: FriendshipSyncEventStatus;
}): boolean {
  const viewer = input.viewerUserId.trim();
  const peer = input.peerUserId.trim();
  const requester = input.requesterUserId.trim();
  const addressee = input.addresseeUserId.trim();
  if (!viewer || !peer || !requester || !addressee) return false;
  const involvesViewer = viewer === requester || viewer === addressee;
  const involvesPeer = peer === requester || peer === addressee;
  return involvesViewer && involvesPeer;
}

export function patchRoomSnapshotAfterFriendshipAccepted(
  prev: CommunityMessengerRoomSnapshot,
  peerUserId: string
): CommunityMessengerRoomSnapshot {
  const peer = peerUserId.trim();
  if (!peer) return prev;
  const directCallGate: DirectCallGateSnapshot = {
    canStartVoice: true,
    canStartVideo: true,
    relationLabel: "mutual_friend",
  };
  const members = prev.members.map((member) =>
    member.id === peer ? { ...member, isFriend: true } : member
  );
  return {
    ...prev,
    members,
    peerFriendshipState: "accepted",
    peerRelationLabel: "mutual_friend",
    directCallGate,
  };
}

export function parseFriendshipRowForRoomSync(
  row: Record<string, unknown>,
  viewerUserId: string,
  peerUserId: string
): { shouldRefresh: boolean; optimisticAccepted: boolean } {
  const status = typeof row.status === "string" ? row.status.trim() : "";
  const requester = typeof row.requester_user_id === "string" ? row.requester_user_id.trim() : "";
  const addressee = typeof row.addressee_user_id === "string" ? row.addressee_user_id.trim() : "";
  const shouldRefresh = shouldRefreshRoomOnFriendshipEvent({
    viewerUserId,
    peerUserId,
    requesterUserId: requester,
    addresseeUserId: addressee,
    status: status as FriendshipSyncEventStatus,
  });
  return {
    shouldRefresh,
    optimisticAccepted: shouldRefresh && status === "accepted",
  };
}
