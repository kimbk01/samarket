/**
 * Bootstrap / lite social deferred — contact list + legacy accepted fallback (P1).
 * Design: docs/community-messenger/friendship-ssot-design.md (G1 amendment)
 */

import {
  contactSaveToCommunityFriendAcceptedRow,
  friendshipSsotRowToCommunityFriendAcceptedRow,
  type CommunityFriendRequestAcceptedRow,
} from "@/lib/community-messenger/friendship/community-messenger-friend-accepted-list";
import { listContactFriendPeersForViewer } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { listHiddenUserRelationshipRows } from "@/lib/community-messenger/social-relations";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Bootstrap `acceptedFriendRows` — matches GET /api/friends contact projection. */
export async function listBootstrapAcceptedFriendRowsFromSsot(
  userId: string,
  options?: { nowMs?: number }
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];

  const [contactPeers, hiddenRows] = await Promise.all([
    listContactFriendPeersForViewer(sb, viewer, options),
    listHiddenUserRelationshipRows(viewer),
  ]);
  const hiddenIdSet = new Set(hiddenRows.map((row) => row.targetUserId));

  return contactPeers
    .filter((entry) => entry.peerUserId && !hiddenIdSet.has(entry.peerUserId))
    .map((entry) =>
      entry.row
        ? friendshipSsotRowToCommunityFriendAcceptedRow(entry.row)
        : contactSaveToCommunityFriendAcceptedRow(viewer, entry.peerUserId, entry.savedAt)
    );
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
