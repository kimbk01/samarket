/**
 * 친구 accepted 목록 — friendships SSOT 1순위, legacy mutual save / requests fallback.
 * UI 없음 · bootstrap·hydrate·친구 API 공통.
 */
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

export type CommunityFriendRequestAcceptedRow = {
  requester_id?: string;
  addressee_id?: string;
  status?: string;
  responded_at?: string | null;
  created_at?: string;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function peerIdFromCommunityFriendAcceptedRow(
  userId: string,
  row: CommunityFriendRequestAcceptedRow
): string {
  const viewer = trimText(userId);
  const requesterId = trimText(row.requester_id);
  const addresseeId = trimText(row.addressee_id);
  if (!viewer) return "";
  return requesterId === viewer ? addresseeId : requesterId;
}

export function friendshipSsotRowToCommunityFriendAcceptedRow(
  row: FriendshipSsotRow
): CommunityFriendRequestAcceptedRow {
  return {
    requester_id: row.requester_user_id,
    addressee_id: row.addressee_user_id,
    status: "accepted",
    responded_at: trimText(row.accepted_at) || trimText(row.updated_at) || null,
    created_at: trimText(row.created_at) || undefined,
  };
}

export function unionCommunityFriendAcceptedRowsByPeer(
  userId: string,
  ...lists: readonly CommunityFriendRequestAcceptedRow[][]
): CommunityFriendRequestAcceptedRow[] {
  return dedupeAcceptedRows(userId, lists.flat());
}

function dedupeAcceptedRows(
  userId: string,
  rows: CommunityFriendRequestAcceptedRow[]
): CommunityFriendRequestAcceptedRow[] {
  const seen = new Set<string>();
  const out: CommunityFriendRequestAcceptedRow[] = [];
  for (const row of rows) {
    const peer = peerIdFromCommunityFriendAcceptedRow(userId, row);
    if (!peer || seen.has(peer)) continue;
    seen.add(peer);
    out.push(row);
  }
  return out;
}

/** SSOT accepted + legacy fallback (SSOT non-accepted peer는 legacy 승격 금지). */
export function mergeCommunityFriendAcceptedRowsFromSources(input: {
  userId: string;
  ssotRows: readonly FriendshipSsotRow[];
  legacyMutualRows: readonly CommunityFriendRequestAcceptedRow[];
  legacyRequestRows: readonly CommunityFriendRequestAcceptedRow[];
}): CommunityFriendRequestAcceptedRow[] {
  const viewer = trimText(input.userId);
  if (!viewer) return [];

  const ssotAcceptedPeers = new Set<string>();
  const ssotNonAcceptedPeers = new Set<string>();
  const merged: CommunityFriendRequestAcceptedRow[] = [];

  for (const row of input.ssotRows) {
    const peer =
      trimText(row.requester_user_id) === viewer
        ? trimText(row.addressee_user_id)
        : trimText(row.requester_user_id);
    if (!peer) continue;
    if (row.status === "accepted") {
      ssotAcceptedPeers.add(peer);
      merged.push(friendshipSsotRowToCommunityFriendAcceptedRow(row));
    } else {
      ssotNonAcceptedPeers.add(peer);
    }
  }

  const appendLegacy = (row: CommunityFriendRequestAcceptedRow) => {
    const peer = peerIdFromCommunityFriendAcceptedRow(viewer, row);
    if (!peer) return;
    if (ssotNonAcceptedPeers.has(peer)) return;
    if (ssotAcceptedPeers.has(peer)) return;
    ssotAcceptedPeers.add(peer);
    merged.push(row);
  };

  for (const row of input.legacyMutualRows) appendLegacy(row);
  for (const row of input.legacyRequestRows) appendLegacy(row);

  return dedupeAcceptedRows(viewer, merged);
}
