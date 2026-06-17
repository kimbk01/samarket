import {
  batchResolveCommunityMessengerFriendshipStatus,
  resolveCommunityMessengerFriendshipStatus,
} from "@/lib/community-messenger/friendship/friendship-resolver";
import { loadFriendshipRow } from "@/lib/community-messenger/friendship/friendship-repository";
import {
  getFriendshipSupabaseOrNull,
  trimFriendshipText,
} from "@/lib/community-messenger/friendship/friendship-utils";

export type FriendshipMessageGateError = "blocked_by_me" | "blocked_me" | "friend_required" | "room_hidden";
export type FriendshipCallGateError = "blocked" | "friend_required" | "room_hidden";
export type FriendshipAddGateError = "self" | "blocked" | "already_friend" | "already_pending" | "readd_blocked";
export type FriendshipUnblockGateError = "not_blocked" | "forbidden";

export async function assertCanSendDirectMessage(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: FriendshipMessageGateError }> {
  const relation = await resolveCommunityMessengerFriendshipStatus(input);
  if (relation.status === "hidden_after_block" || relation.status === "hidden_after_decline") {
    return { ok: false, error: "room_hidden" };
  }
  if (relation.isBlockedByMe) return { ok: false, error: "blocked_by_me" };
  if (relation.isBlockedByPeer) return { ok: false, error: "blocked_me" };
  if (relation.status !== "accepted") return { ok: false, error: "friend_required" };
  return { ok: true };
}

export async function assertCanStartDirectCall(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: FriendshipCallGateError }> {
  const relation = await resolveCommunityMessengerFriendshipStatus(input);
  if (relation.status === "hidden_after_block" || relation.status === "hidden_after_decline") {
    return { ok: false, error: "room_hidden" };
  }
  if (relation.isBlockedByMe || relation.isBlockedByPeer) return { ok: false, error: "blocked" };
  if (relation.status !== "accepted") return { ok: false, error: "friend_required" };
  return { ok: true };
}

export async function assertCanAddFriend(input: {
  viewerUserId: string;
  peerUserId: string;
}): Promise<{ ok: true } | { ok: false; error: FriendshipAddGateError; readdBlockedUntil?: string | null }> {
  const viewer = trimFriendshipText(input.viewerUserId);
  const peer = trimFriendshipText(input.peerUserId);
  if (!viewer || !peer) return { ok: false, error: "self" };
  if (viewer === peer) return { ok: false, error: "self" };
  const relation = await resolveCommunityMessengerFriendshipStatus({ viewerUserId: viewer, peerUserId: peer });
  if (relation.isBlockedByMe || relation.isBlockedByPeer || relation.friendshipStatus === "blocked") {
    return { ok: false, error: "blocked" };
  }
  if (relation.status === "accepted") return { ok: false, error: "already_friend" };
  if (relation.status === "request_pending_outgoing" || relation.status === "request_pending_incoming") {
    return { ok: false, error: "already_pending" };
  }
  if (!relation.canAddFriend) {
    return { ok: false, error: "readd_blocked", readdBlockedUntil: relation.readdBlockedUntil };
  }
  return { ok: true };
}

export async function assertCanUnblockFriend(input: {
  viewerUserId: string;
  peerUserId: string;
}): Promise<{ ok: true; friendshipId: string } | { ok: false; error: FriendshipUnblockGateError }> {
  const viewer = trimFriendshipText(input.viewerUserId);
  const peer = trimFriendshipText(input.peerUserId);
  const sb = getFriendshipSupabaseOrNull();
  if (!sb || !viewer || !peer) return { ok: false, error: "not_blocked" };
  const row = await loadFriendshipRow(sb, viewer, peer);
  if (!row || row.status !== "blocked") return { ok: false, error: "not_blocked" };
  if (row.blockedByUserId !== viewer) return { ok: false, error: "forbidden" };
  return { ok: true, friendshipId: row.id };
}

/** backward-compatible aliases */
export const assertCommunityMessengerPeerCanMessage = assertCanSendDirectMessage;
export const assertCommunityMessengerPeerCanCall = assertCanStartDirectCall;

export { batchResolveCommunityMessengerFriendshipStatus };
