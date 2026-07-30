/**
 * community_messenger_friendships — archive/compat readers only.
 * Pending friend-request writers removed (Telegram Contact LOCK).
 * Friend list SSOT: user_social_relations.friend via listContactFriendPeersForViewer.
 */

import type { CommunityMessengerFriendRequestStatus } from "@/lib/community-messenger/types";

export type FriendshipSsotRow = {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: "pending" | "accepted" | "blocked" | "removed";
  blocked_by_user_id?: string | null;
  blocked_at?: string | null;
  readd_blocked_until?: string | null;
  created_at: string;
  accepted_at?: string | null;
  removed_at?: string | null;
  updated_at: string;
};

export type FriendshipRequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: CommunityMessengerFriendRequestStatus;
  created_at: string;
  responded_at?: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

export function friendshipRowToRequestRow(row: FriendshipSsotRow): FriendshipRequestRow {
  const status: CommunityMessengerFriendRequestStatus =
    row.status === "pending"
      ? "pending"
      : row.status === "accepted"
        ? "accepted"
        : row.status === "blocked"
          ? "blocked"
          : "rejected";
  return {
    id: row.id,
    requester_id: row.requester_user_id,
    addressee_id: row.addressee_user_id,
    status,
    created_at: row.created_at,
    responded_at: row.removed_at ?? row.accepted_at ?? null,
  };
}

/** @deprecated Prefer resolveFriendshipPair / user_social_relations — retained for test mocks. */
export async function fetchFriendshipPairRow(
  sb: { from: (table: string) => unknown },
  userId: string,
  targetUserId: string
): Promise<FriendshipSsotRow | null> {
  const a = trimText(userId);
  const b = trimText(targetUserId);
  if (!a || !b) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(
      "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, readd_blocked_until, created_at, accepted_at, removed_at, updated_at"
    )
    .or(
      `and(requester_user_id.eq.${a},addressee_user_id.eq.${b}),and(requester_user_id.eq.${b},addressee_user_id.eq.${a})`
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as FriendshipSsotRow | null) ?? null;
}

/** @deprecated pending archive reader — listCommunityMessengerFriendRequests returns []. */
export async function listPendingFriendRequestRowsFromFriendshipsSsot(
  sb: { from: (table: string) => unknown },
  userId: string
): Promise<FriendshipRequestRow[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select("id, requester_user_id, addressee_user_id, status, created_at, accepted_at, removed_at, updated_at")
    .eq("status", "pending")
    .or(`requester_user_id.eq.${viewer},addressee_user_id.eq.${viewer}`)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return ((data ?? []) as FriendshipSsotRow[]).map(friendshipRowToRequestRow);
}

/** viewer 가 참여한 friendships 전체 — bootstrap accepted merge compat. */
export async function listFriendshipSsotRowsForViewer(
  sb: { from: (table: string) => unknown },
  userId: string
): Promise<FriendshipSsotRow[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(
      "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, readd_blocked_until, created_at, accepted_at, removed_at, updated_at"
    )
    .or(`requester_user_id.eq.${viewer},addressee_user_id.eq.${viewer}`)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data ?? []) as FriendshipSsotRow[];
}
