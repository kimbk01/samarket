/**
 * community_messenger_friendships SSOT — bootstrap RPC·Realtime·친구 요청 API 공통 저장소.
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

function nowIso(): string {
  return new Date().toISOString();
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

export async function insertPendingFriendshipRequest(
  sb: { from: (table: string) => unknown },
  requesterId: string,
  addresseeId: string
): Promise<{ ok: true; row: FriendshipRequestRow } | { ok: false; error: string }> {
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .insert({
      requester_user_id: requesterId,
      addressee_user_id: addresseeId,
      status: "pending",
    })
    .select("id, requester_user_id, addressee_user_id, status, created_at, accepted_at, removed_at, updated_at")
    .single();
  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: "friend_store_unavailable" };
    return { ok: false, error: String(error.message ?? "friend_request_failed") };
  }
  return { ok: true, row: friendshipRowToRequestRow(data as FriendshipSsotRow) };
}

export async function resetFriendshipToPending(
  sb: { from: (table: string) => unknown },
  friendshipId: string,
  requesterId: string,
  addresseeId: string
): Promise<{ ok: true; row: FriendshipRequestRow } | { ok: false; error: string }> {
  const ts = nowIso();
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .update({
      requester_user_id: requesterId,
      addressee_user_id: addresseeId,
      status: "pending",
      accepted_at: null,
      removed_at: null,
      blocked_by_user_id: null,
      blocked_at: null,
      updated_at: ts,
    })
    .eq("id", friendshipId)
    .select("id, requester_user_id, addressee_user_id, status, created_at, accepted_at, removed_at, updated_at")
    .single();
  if (error) {
    return { ok: false, error: String(error.message ?? "friend_request_reset_failed") };
  }
  return { ok: true, row: friendshipRowToRequestRow(data as FriendshipSsotRow) };
}

export async function fetchFriendshipRequestRowById(
  sb: { from: (table: string) => unknown },
  requestId: string
): Promise<FriendshipSsotRow | null> {
  const id = trimText(requestId);
  if (!id) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(
      "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, readd_blocked_until, created_at, accepted_at, removed_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as FriendshipSsotRow | null) ?? null;
}

export async function applyFriendshipRequestAction(
  sb: { from: (table: string) => unknown },
  row: FriendshipSsotRow,
  userId: string,
  action: "accept" | "reject" | "cancel"
): Promise<{ ok: true; row: FriendshipSsotRow } | { ok: false; error: string }> {
  const allowed =
    (action === "cancel" && row.requester_user_id === userId) ||
    ((action === "accept" || action === "reject") && row.addressee_user_id === userId);
  if (!allowed) return { ok: false, error: "forbidden" };
  if (row.status !== "pending") return { ok: false, error: "not_pending" };

  const ts = nowIso();
  const patch =
    action === "accept"
      ? { status: "accepted", accepted_at: ts, removed_at: null, updated_at: ts }
      : { status: "removed", removed_at: ts, accepted_at: null, updated_at: ts };

  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .update(patch)
    .eq("id", row.id)
    .select(
      "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, readd_blocked_until, created_at, accepted_at, removed_at, updated_at"
    )
    .single();
  if (error) {
    return { ok: false, error: String(error.message ?? "update_failed") };
  }
  return { ok: true, row: data as FriendshipSsotRow };
}

export async function findPendingOutgoingFriendshipRow(
  sb: { from: (table: string) => unknown },
  requesterId: string,
  addresseeId: string
): Promise<FriendshipSsotRow | null> {
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select(
      "id, requester_user_id, addressee_user_id, status, blocked_by_user_id, blocked_at, readd_blocked_until, created_at, accepted_at, removed_at, updated_at"
    )
    .eq("requester_user_id", requesterId)
    .eq("addressee_user_id", addresseeId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as FriendshipSsotRow | null) ?? null;
}
