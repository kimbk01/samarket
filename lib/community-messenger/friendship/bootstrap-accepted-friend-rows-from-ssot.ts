/**
 * Bootstrap / lite social deferred — SSOT accepted rows only (Step 4).
 * Design: docs/community-messenger/friendship-ssot-design.md
 *
 * Same accepted peer projection as `listCommunityMessengerFriendsFromSsot` (hidden excluded).
 * DO NOT merge legacy community_friend_requests or RPC accepted_friends overlay.
 */

import {
  friendshipSsotRowToCommunityFriendAcceptedRow,
  type CommunityFriendRequestAcceptedRow,
} from "@/lib/community-messenger/friendship/community-messenger-friend-accepted-list";
import { listAcceptedFriendshipPeersForViewer } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { listHiddenUserRelationshipRows } from "@/lib/community-messenger/social-relations";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Bootstrap `acceptedFriendRows` — SSOT accepted peers only (matches GET /api/friends list). */
export async function listBootstrapAcceptedFriendRowsFromSsot(
  userId: string,
  options?: { nowMs?: number }
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];

  const [acceptedPeers, hiddenRows] = await Promise.all([
    listAcceptedFriendshipPeersForViewer(sb, viewer, options),
    listHiddenUserRelationshipRows(viewer),
  ]);
  const hiddenIdSet = new Set(hiddenRows.map((row) => row.targetUserId));

  return acceptedPeers
    .filter((entry) => entry.peerUserId && !hiddenIdSet.has(entry.peerUserId))
    .map((entry) => friendshipSsotRowToCommunityFriendAcceptedRow(entry.row));
}

export async function listSsotAcceptedPeerIdsForViewer(
  userId: string,
  options?: { nowMs?: number }
): Promise<string[]> {
  const rows = await listBootstrapAcceptedFriendRowsFromSsot(userId, options);
  const viewer = trimText(userId);
  if (!viewer) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const requesterId = trimText(row.requester_id);
    const addresseeId = trimText(row.addressee_id);
    const peerId = requesterId === viewer ? addresseeId : requesterId;
    if (!peerId || seen.has(peerId)) continue;
    seen.add(peerId);
    out.push(peerId);
  }
  return out;
}
