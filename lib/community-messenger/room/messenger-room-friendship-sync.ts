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
    friendshipDirection: "mutual_accepted",
    pendingFriendshipRequestId: undefined,
    peerRelationLabel: "mutual_friend",
    directCallGate,
  };
}

/** Viewer sent friend request — hide stranger PeerNotice until bootstrap refresh. */
export function patchRoomSnapshotAfterFriendshipOutgoingPending(
  prev: CommunityMessengerRoomSnapshot,
  options?: { pendingFriendshipRequestId?: string | null }
): CommunityMessengerRoomSnapshot {
  const pendingId = options?.pendingFriendshipRequestId?.trim() ?? "";
  return {
    ...prev,
    peerFriendshipState: "pending",
    friendshipDirection: "outgoing_pending",
    ...(pendingId ? { pendingFriendshipRequestId: pendingId } : {}),
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

/**
 * F-9: `user_social_relations`(owner_user_id=viewer 필터) Realtime 행 → 방 refresh 여부.
 * 내가 상대를 친구 저장·차단·해제한 행(target=peer)만 반응한다. 단방향 저장이므로 낙관적 accepted 패치는 하지 않는다.
 */
export function parseSocialRelationRowForRoomSync(
  row: Record<string, unknown>,
  viewerUserId: string,
  peerUserId: string
): { shouldRefresh: boolean; optimisticAccepted: false } {
  const viewer = viewerUserId.trim();
  const peer = peerUserId.trim();
  const owner = typeof row.owner_user_id === "string" ? row.owner_user_id.trim() : "";
  const target = typeof row.target_user_id === "string" ? row.target_user_id.trim() : "";
  const shouldRefresh = Boolean(viewer && peer && target === peer && (!owner || owner === viewer));
  return { shouldRefresh, optimisticAccepted: false };
}
