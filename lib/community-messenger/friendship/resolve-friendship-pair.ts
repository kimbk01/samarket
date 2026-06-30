/**
 * Friendship SSOT read resolver — Step 1 contract.
 * Design: docs/community-messenger/friendship-ssot-design.md
 *
 * `resolveFriendshipPair` is the single friendship pair judgment entry (Gate A).
 * Migration read-only legacy fallback is internal to this module only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchFriendshipPairRow,
  listFriendshipSsotRowsForViewer,
  type FriendshipSsotRow,
} from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

export type FriendshipPairState =
  | "none"
  | "pending"
  | "accepted"
  | "blocked"
  | "removed"
  | "readd_cooldown";

export type FriendshipDirection =
  | "none"
  | "outgoing_pending"
  | "incoming_pending"
  | "mutual_accepted";

export type FriendshipJudgmentSource =
  | "friendships_ssot"
  | "social_relations"
  | "legacy_requests"
  | "none";

export type ResolveFriendshipPairResult = {
  state: FriendshipPairState;
  direction: FriendshipDirection;
  row: FriendshipSsotRow | null;
  source: FriendshipJudgmentSource;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

/** SSOT row → viewer-relative pair state (no legacy). */
export function mapFriendshipPairStateFromSsotRow(
  row: FriendshipSsotRow,
  nowMs = Date.now()
): FriendshipPairState {
  const until = trimText(row.readd_blocked_until);
  if (until) {
    const ts = Date.parse(until);
    if (Number.isFinite(ts) && ts > nowMs) return "readd_cooldown";
  }
  if (row.status === "accepted") return "accepted";
  if (row.status === "pending") return "pending";
  if (row.status === "blocked") return "blocked";
  if (row.status === "removed") return "removed";
  return "none";
}

/** SSOT row + state → direction (PeerNotice / CTA). */
export function mapFriendshipDirectionFromSsot(
  viewerUserId: string,
  row: FriendshipSsotRow | null,
  state: FriendshipPairState
): FriendshipDirection {
  if (state === "accepted") return "mutual_accepted";
  if (state !== "pending" || !row) return "none";
  const viewer = trimText(viewerUserId);
  if (viewer === trimText(row.requester_user_id)) return "outgoing_pending";
  if (viewer === trimText(row.addressee_user_id)) return "incoming_pending";
  return "none";
}

function buildResult(
  viewerUserId: string,
  input: {
    state: FriendshipPairState;
    source: FriendshipJudgmentSource;
    row: FriendshipSsotRow | null;
  }
): ResolveFriendshipPairResult {
  return {
    state: input.state,
    direction: mapFriendshipDirectionFromSsot(viewerUserId, input.row, input.state),
    row: input.row,
    source: input.source,
  };
}

async function isMutualFriendSavedInSocialRelations(
  sb: SupabaseClient<any>,
  userA: string,
  userB: string
): Promise<boolean> {
  const [{ data: ab }, { data: ba }] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("id")
      .eq("owner_user_id", userA)
      .eq("target_user_id", userB)
      .eq("relation_type", "friend")
      .maybeSingle(),
    (sb as any)
      .from("user_social_relations")
      .select("id")
      .eq("owner_user_id", userB)
      .eq("target_user_id", userA)
      .eq("relation_type", "friend")
      .maybeSingle(),
  ]);
  return Boolean(ab?.id && ba?.id);
}

async function hasLegacyAcceptedFriendRequest(
  sb: SupabaseClient<any>,
  userA: string,
  userB: string
): Promise<boolean> {
  const { data, error } = await (sb as any)
    .from("community_friend_requests")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${userA},addressee_id.eq.${userB}),and(requester_id.eq.${userB},addressee_id.eq.${userA})`
    )
    .limit(1)
    .maybeSingle();
  if (error && !isMissingTableError(error)) return false;
  return Boolean(data?.id);
}

/**
 * Single friendship pair judgment — SSOT 1순위, migration read-only legacy fallback.
 */
export async function resolveFriendshipPair(
  sb: SupabaseClient<any> | null,
  viewerUserId: string,
  peerUserId: string,
  options?: { nowMs?: number }
): Promise<ResolveFriendshipPairResult> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer || viewer === peer) {
    return buildResult(viewer, { state: "none", source: "none", row: null });
  }
  if (!sb) {
    return buildResult(viewer, { state: "none", source: "none", row: null });
  }

  const nowMs = options?.nowMs ?? Date.now();
  try {
    const row = await fetchFriendshipPairRow(sb, viewer, peer);
    if (row) {
      const state = mapFriendshipPairStateFromSsotRow(row, nowMs);
      return buildResult(viewer, { state, source: "friendships_ssot", row });
    }
  } catch {
    /* migration fallback below */
  }

  if (await isMutualFriendSavedInSocialRelations(sb, viewer, peer)) {
    return buildResult(viewer, {
      state: "accepted",
      source: "social_relations",
      row: null,
    });
  }
  if (await hasLegacyAcceptedFriendRequest(sb, viewer, peer)) {
    return buildResult(viewer, {
      state: "accepted",
      source: "legacy_requests",
      row: null,
    });
  }

  return buildResult(viewer, { state: "none", source: "none", row: null });
}

/** Accepted peers from SSOT rows only — no legacy merge (list projection). */
export function peerUserIdFromFriendshipSsotRow(
  viewerUserId: string,
  row: FriendshipSsotRow
): string | null {
  const viewer = trimText(viewerUserId);
  if (viewer === trimText(row.requester_user_id)) return trimText(row.addressee_user_id) || null;
  if (viewer === trimText(row.addressee_user_id)) return trimText(row.requester_user_id) || null;
  return null;
}

/** Friend list projection — SSOT accepted rows only. */
export async function listAcceptedFriendshipPeersForViewer(
  sb: SupabaseClient<any> | null,
  viewerUserId: string,
  options?: { nowMs?: number }
): Promise<Array<{ peerUserId: string; row: FriendshipSsotRow }>> {
  const viewer = trimText(viewerUserId);
  if (!viewer || !sb) return [];
  const nowMs = options?.nowMs ?? Date.now();
  const rows = await listFriendshipSsotRowsForViewer(sb, viewer);
  const out: Array<{ peerUserId: string; row: FriendshipSsotRow }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (mapFriendshipPairStateFromSsotRow(row, nowMs) !== "accepted") continue;
    const peerUserId = peerUserIdFromFriendshipSsotRow(viewer, row);
    if (!peerUserId || seen.has(peerUserId)) continue;
    seen.add(peerUserId);
    out.push({ peerUserId, row });
  }
  return out;
}
