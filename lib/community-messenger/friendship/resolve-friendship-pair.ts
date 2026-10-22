/**
 * Friendship / Contact SSOT read resolver — Telegram-style unilateral contact.
 * LOCK: docs/community-messenger/friend-contact-ssot-lock.md
 *
 * `resolveFriendshipPair` is the single friendship pair judgment entry.
 * Write/read SSOT: `user_social_relations.relation_type=friend` (owner→target).
 * No pending / accept / mutual-required judgment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

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

/** @deprecated pending/cooldown mapping retained for type compat — Contact model unused. */
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

/** Contact model: accepted → mutual_accepted label only when viewer saved peer. */
export function mapFriendshipDirectionFromSsot(
  viewerUserId: string,
  row: FriendshipSsotRow | null,
  state: FriendshipPairState
): FriendshipDirection {
  if (state === "accepted") return "mutual_accepted";
  void viewerUserId;
  void row;
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

async function isFriendSavedByViewer(
  sb: SupabaseClient<any>,
  viewerUserId: string,
  peerUserId: string
): Promise<boolean> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer || viewer === peer) return false;
  const { data, error } = await (sb as any)
    .from("user_social_relations")
    .select("id")
    .eq("owner_user_id", viewer)
    .eq("target_user_id", peer)
    .eq("relation_type", "friend")
    .maybeSingle();
  if (error && !isMissingTableError(error)) return false;
  return Boolean(data?.id);
}

/**
 * Single friendship pair judgment — viewer-local contact only.
 */
export async function resolveFriendshipPair(
  sb: SupabaseClient<any> | null,
  viewerUserId: string,
  peerUserId: string,
  _options?: { nowMs?: number }
): Promise<ResolveFriendshipPairResult> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer || viewer === peer) {
    return buildResult(viewer, { state: "none", source: "none", row: null });
  }
  if (!sb) {
    return buildResult(viewer, { state: "none", source: "none", row: null });
  }

  if (await isFriendSavedByViewer(sb, viewer, peer)) {
    return buildResult(viewer, {
      state: "accepted",
      source: "social_relations",
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

export type ContactFriendListEntry = {
  peerUserId: string;
  savedAt: string | null;
  source: FriendshipJudgmentSource;
  row: FriendshipSsotRow | null;
};

/** Friend list — viewer contact saves only (no friendships accepted fallback). */
export async function listContactFriendPeersForViewer(
  sb: SupabaseClient<any> | null,
  viewerUserId: string,
  _options?: { nowMs?: number }
): Promise<ContactFriendListEntry[]> {
  const viewer = trimText(viewerUserId);
  if (!viewer || !sb) return [];

  const byPeer = new Map<string, ContactFriendListEntry>();

  const { data: contactRows, error: contactError } = await (sb as any)
    .from("user_social_relations")
    .select("target_user_id, created_at")
    .eq("owner_user_id", viewer)
    .eq("relation_type", "friend");
  if (!contactError || !isMissingTableError(contactError)) {
    for (const raw of contactRows ?? []) {
      const peerUserId = trimText((raw as { target_user_id?: string }).target_user_id);
      if (!peerUserId || peerUserId === viewer) continue;
      const savedAt = trimText((raw as { created_at?: string }).created_at) || null;
      byPeer.set(peerUserId, {
        peerUserId,
        savedAt,
        source: "social_relations",
        row: null,
      });
    }
  }

  return [...byPeer.values()];
}

/** @deprecated alias — use `listContactFriendPeersForViewer` */
export async function listAcceptedFriendshipPeersForViewer(
  sb: SupabaseClient<any> | null,
  viewerUserId: string,
  options?: { nowMs?: number }
): Promise<Array<{ peerUserId: string; row: FriendshipSsotRow }>> {
  const entries = await listContactFriendPeersForViewer(sb, viewerUserId, options);
  return entries
    .filter((entry): entry is ContactFriendListEntry & { row: FriendshipSsotRow } => entry.row != null)
    .map((entry) => ({ peerUserId: entry.peerUserId, row: entry.row }));
}
