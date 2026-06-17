import type { CommunityMessengerFriendshipState } from "@/lib/community-messenger/friendship/types";
import {
  friendshipRowForPeer,
  loadFriendshipRow,
  loadFriendshipRowsForViewer,
  loadLegacyBlockedDirections,
  loadLegacyMutualFriendPeerIds,
} from "@/lib/community-messenger/friendship/friendship-repository";
import {
  getFriendshipSupabaseOrNull,
  trimFriendshipText,
  type FriendshipSupabaseClient,
} from "@/lib/community-messenger/friendship/friendship-utils";

function emptyFriendshipState(
  status: CommunityMessengerFriendshipState["status"]
): CommunityMessengerFriendshipState {
  const blocked =
    status === "blocked_by_me" || status === "blocked_me" || status === "hidden_after_block";
  const accepted = status === "accepted";
  return {
    status,
    friendshipStatus: accepted ? "accepted" : blocked ? "blocked" : "none",
    friendshipId: null,
    canMessage: accepted,
    canCall: accepted,
    canAddFriend: status === "none" || status === "declined",
    canUnblock: status === "blocked_by_me",
    isFriend: accepted,
    isBlockedByMe: status === "blocked_by_me" || status === "hidden_after_block",
    isBlockedByPeer: status === "blocked_me",
    readdBlockedUntil: null,
    requestRoomId: null,
    requestMessageId: null,
    ...(blocked ? { canMessage: false, canCall: false, canAddFriend: false, canUnblock: false } : {}),
  };
}

function mapFriendshipRowToState(
  viewerUserId: string,
  row: NonNullable<Awaited<ReturnType<typeof loadFriendshipRow>>>
): CommunityMessengerFriendshipState {
  const base = emptyFriendshipState("none");
  const patch = {
    friendshipId: row.id,
    friendshipStatus: row.status,
    readdBlockedUntil: row.readdBlockedUntil,
  };
  if (row.status === "pending") {
    const outgoing = row.requesterUserId === viewerUserId;
    return {
      ...base,
      ...patch,
      status: outgoing ? "request_pending_outgoing" : "request_pending_incoming",
      canMessage: false,
      canCall: false,
      canAddFriend: false,
    };
  }
  if (row.status === "accepted") return { ...emptyFriendshipState("accepted"), ...patch };
  if (row.status === "removed") {
    const blockedUntil = row.readdBlockedUntil;
    const canAdd =
      !blockedUntil || Number.isNaN(Date.parse(blockedUntil)) || Date.parse(blockedUntil) <= Date.now();
    return { ...base, ...patch, canAddFriend: canAdd };
  }
  if (row.status === "blocked") {
    const blockedByMe = row.blockedByUserId === viewerUserId;
    return {
      ...emptyFriendshipState(blockedByMe ? "blocked_by_me" : "blocked_me"),
      ...patch,
      canUnblock: blockedByMe,
    };
  }
  return base;
}

async function loadParticipantHideState(
  sb: FriendshipSupabaseClient,
  viewerUserId: string,
  roomId?: string | null
): Promise<"hidden_after_block" | "hidden_after_decline" | null> {
  const rid = trimFriendshipText(roomId);
  if (!rid) return null;
  const { data } = await (sb as any)
    .from("community_messenger_participants")
    .select("blocked_hidden_at, declined_hidden_at")
    .eq("room_id", rid)
    .eq("user_id", viewerUserId)
    .maybeSingle();
  const row = data as { blocked_hidden_at?: string | null; declined_hidden_at?: string | null } | null;
  if (row?.blocked_hidden_at) return "hidden_after_block";
  if (row?.declined_hidden_at) return "hidden_after_decline";
  return null;
}

export async function resolveCommunityMessengerFriendshipStatus(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId?: string | null;
  /** batch 경로에서 미리 로드한 row */
  preloadedRow?: Awaited<ReturnType<typeof loadFriendshipRow>> | null;
  /** batch 경로에서 미리 로드한 legacy mutual friend 여부 */
  legacyMutualFriend?: boolean;
}): Promise<CommunityMessengerFriendshipState> {
  const viewer = trimFriendshipText(input.viewerUserId);
  const peer = trimFriendshipText(input.peerUserId);
  if (!viewer || !peer || viewer === peer) return emptyFriendshipState("none");

  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return emptyFriendshipState("none");

  const blocked = await loadLegacyBlockedDirections(sb, viewer, peer);
  if (blocked) return emptyFriendshipState(blocked);

  const [friendship, hideState] = await Promise.all([
    input.preloadedRow !== undefined
      ? Promise.resolve(input.preloadedRow)
      : loadFriendshipRow(sb, viewer, peer),
    loadParticipantHideState(sb, viewer, input.roomId),
  ]);
  if (hideState) return emptyFriendshipState(hideState);
  if (friendship) return mapFriendshipRowToState(viewer, friendship);

  if (input.legacyMutualFriend) {
    return emptyFriendshipState("accepted");
  }
  if (input.legacyMutualFriend === undefined) {
    const mutual = await loadLegacyMutualFriendPeerIds(sb, viewer, [peer]);
    if (mutual.has(peer)) return emptyFriendshipState("accepted");
  }

  return emptyFriendshipState("none");
}

export async function batchResolveCommunityMessengerFriendshipStatus(
  viewerUserId: string,
  peerUserIds: string[],
  roomIdByPeerId?: Map<string, string>
): Promise<Map<string, CommunityMessengerFriendshipState>> {
  const viewer = trimFriendshipText(viewerUserId);
  const peers = [...new Set(peerUserIds.map((id) => trimFriendshipText(id)).filter(Boolean))];
  const out = new Map<string, CommunityMessengerFriendshipState>();
  if (!viewer || !peers.length) return out;

  const sb = getFriendshipSupabaseOrNull();
  if (!sb) {
    for (const peer of peers) out.set(peer, emptyFriendshipState("none"));
    return out;
  }

  const [allRows, legacyMutual] = await Promise.all([
    loadFriendshipRowsForViewer(sb, viewer),
    loadLegacyMutualFriendPeerIds(sb, viewer, peers),
  ]);

  await Promise.all(
    peers.map(async (peer) => {
      const preloaded = friendshipRowForPeer(allRows, viewer, peer);
      const state = await resolveCommunityMessengerFriendshipStatus({
        viewerUserId: viewer,
        peerUserId: peer,
        roomId: roomIdByPeerId?.get(peer) ?? null,
        preloadedRow: preloaded,
        legacyMutualFriend: legacyMutual.has(peer),
      });
      out.set(peer, state);
    })
  );
  return out;
}

/** backward-compatible alias */
export const resolveCommunityMessengerPeerRelationStatus = resolveCommunityMessengerFriendshipStatus;

export type { CommunityMessengerFriendshipState as CommunityMessengerPeerRelationState };
