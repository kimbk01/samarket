import type {
  CommunityMessengerFriendshipDbStatus,
  CommunityMessengerFriendshipRow,
} from "@/lib/community-messenger/friendship/types";
import {
  friendshipPairKey,
  getFriendshipSupabaseOrNull,
  isFriendshipMissingTableError,
  trimFriendshipText,
  type FriendshipSupabaseClient,
} from "@/lib/community-messenger/friendship/friendship-utils";

type RawFriendshipRow = {
  id?: string;
  requester_user_id?: string;
  addressee_user_id?: string;
  status?: string;
  blocked_by_user_id?: string | null;
  blocked_at?: string | null;
  unblocked_at?: string | null;
  readd_blocked_until?: string | null;
  accepted_at?: string | null;
  removed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function mapFriendshipRow(raw: RawFriendshipRow | null | undefined): CommunityMessengerFriendshipRow | null {
  if (!raw?.id) return null;
  const status = trimFriendshipText(raw.status) as CommunityMessengerFriendshipDbStatus;
  if (status !== "pending" && status !== "accepted" && status !== "blocked" && status !== "removed") {
    return null;
  }
  return {
    id: trimFriendshipText(raw.id),
    requesterUserId: trimFriendshipText(raw.requester_user_id),
    addresseeUserId: trimFriendshipText(raw.addressee_user_id),
    status,
    blockedByUserId: trimFriendshipText(raw.blocked_by_user_id) || null,
    blockedAt: raw.blocked_at ?? null,
    unblockedAt: raw.unblocked_at ?? null,
    readdBlockedUntil: raw.readd_blocked_until ?? null,
    acceptedAt: raw.accepted_at ?? null,
    removedAt: raw.removed_at ?? null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

const FRIENDSHIP_SELECT =
  "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, unblocked_at, readd_blocked_until, accepted_at, removed_at, created_at, updated_at";

export async function loadFriendshipRow(
  sb: FriendshipSupabaseClient,
  userA: string,
  userB: string
): Promise<CommunityMessengerFriendshipRow | null> {
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(FRIENDSHIP_SELECT)
    .or(
      `and(requester_user_id.eq.${userA},addressee_user_id.eq.${userB}),and(requester_user_id.eq.${userB},addressee_user_id.eq.${userA})`
    )
    .maybeSingle();
  if (error && !isFriendshipMissingTableError(error)) return null;
  return mapFriendshipRow(data as RawFriendshipRow);
}

export async function loadFriendshipRowsForViewer(
  sb: FriendshipSupabaseClient,
  viewerUserId: string
): Promise<CommunityMessengerFriendshipRow[]> {
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(FRIENDSHIP_SELECT)
    .or(`requester_user_id.eq.${viewerUserId},addressee_user_id.eq.${viewerUserId}`);
  if (error && !isFriendshipMissingTableError(error)) return [];
  return ((data ?? []) as RawFriendshipRow[])
    .map((row) => mapFriendshipRow(row))
    .filter((row): row is CommunityMessengerFriendshipRow => row != null);
}

export function friendshipRowForPeer(
  rows: CommunityMessengerFriendshipRow[],
  viewerUserId: string,
  peerUserId: string
): CommunityMessengerFriendshipRow | null {
  const pair = friendshipPairKey(viewerUserId, peerUserId);
  return (
    rows.find((row) => friendshipPairKey(row.requesterUserId, row.addresseeUserId) === pair) ?? null
  );
}

export async function loadLegacyMutualFriendPeerIds(
  sb: FriendshipSupabaseClient,
  viewerUserId: string,
  peerUserIds: string[]
): Promise<Set<string>> {
  const peers = [...new Set(peerUserIds.map((id) => trimFriendshipText(id)).filter(Boolean))];
  if (!peers.length) return new Set();
  const [outgoing, incoming] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("target_user_id")
      .eq("owner_user_id", viewerUserId)
      .eq("relation_type", "friend")
      .in("target_user_id", peers),
    (sb as any)
      .from("user_social_relations")
      .select("owner_user_id")
      .eq("target_user_id", viewerUserId)
      .eq("relation_type", "friend")
      .in("owner_user_id", peers),
  ]);
  const outgoingSet = new Set(
    ((outgoing.data ?? []) as Array<{ target_user_id?: string }>).map((row) => trimFriendshipText(row.target_user_id))
  );
  const mutual = new Set<string>();
  for (const row of (incoming.data ?? []) as Array<{ owner_user_id?: string }>) {
    const peerId = trimFriendshipText(row.owner_user_id);
    if (peerId && outgoingSet.has(peerId)) mutual.add(peerId);
  }
  return mutual;
}

export async function loadLegacyBlockedDirections(
  sb: FriendshipSupabaseClient,
  viewerUserId: string,
  peerUserId: string
): Promise<"blocked_by_me" | "blocked_me" | null> {
  const [social, friendshipBlocked] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("owner_user_id")
      .eq("relation_type", "blocked")
      .or(
        `and(owner_user_id.eq.${viewerUserId},target_user_id.eq.${peerUserId}),and(owner_user_id.eq.${peerUserId},target_user_id.eq.${viewerUserId})`
      ),
    loadFriendshipRow(sb, viewerUserId, peerUserId),
  ]);
  if (friendshipBlocked?.status === "blocked") {
    return friendshipBlocked.blockedByUserId === viewerUserId ? "blocked_by_me" : "blocked_me";
  }
  const rows = ((social.data ?? []) as Array<{ owner_user_id?: string }>).map((row) =>
    trimFriendshipText(row.owner_user_id)
  );
  if (rows.includes(viewerUserId)) return "blocked_by_me";
  if (rows.includes(peerUserId)) return "blocked_me";
  return null;
}

export function getFriendshipSupabase(): FriendshipSupabaseClient | null {
  return getFriendshipSupabaseOrNull();
}
