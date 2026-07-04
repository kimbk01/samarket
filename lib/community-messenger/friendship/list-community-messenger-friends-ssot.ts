/**
 * Friend List read path — viewer-local contact + legacy accepted fallback (P1).
 * Design: docs/community-messenger/friendship-ssot-design.md (G1 amendment)
 */

import {
  buildProfilesFromKnownRelations,
  hydrateProfilesLabelsOnlyWithMap,
} from "@/lib/community-messenger/service";
import { listHiddenUserRelationshipRows } from "@/lib/community-messenger/social-relations";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listContactFriendPeersForViewer } from "@/lib/community-messenger/friendship/resolve-friendship-pair";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function listFavoriteFriendTargetIds(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  viewerUserId: string,
  scopePeerIds: readonly string[]
): Promise<string[]> {
  const viewer = trimText(viewerUserId);
  if (!viewer || !scopePeerIds.length) return [];
  const { data, error } = await (sb as any)
    .from("community_friend_favorites")
    .select("target_user_id")
    .eq("user_id", viewer)
    .in("target_user_id", [...scopePeerIds]);
  if (error) return [];
  return (data ?? [])
    .map((row: { target_user_id?: string | null }) => trimText(row.target_user_id))
    .filter(Boolean);
}

/** GET /api/community-messenger/friends — contact saves + legacy accepted fallback. */
export async function listCommunityMessengerFriendsFromSsot(
  userId: string,
  options?: { nowMs?: number }
): Promise<CommunityMessengerProfileLite[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];

  const contactPeers = await listContactFriendPeersForViewer(sb, viewer, options);
  if (!contactPeers.length) return [];

  const hiddenRows = await listHiddenUserRelationshipRows(viewer);
  const hiddenIdSet = new Set(hiddenRows.map((row) => row.targetUserId));

  const friendIds = contactPeers
    .map((entry) => entry.peerUserId)
    .filter((peerId) => peerId && !hiddenIdSet.has(peerId));

  if (!friendIds.length) return [];

  const friendshipAcceptedAtByPeer = new Map<string, string>();
  for (const entry of contactPeers) {
    if (hiddenIdSet.has(entry.peerUserId)) continue;
    const at = trimText(entry.savedAt);
    if (at) friendshipAcceptedAtByPeer.set(entry.peerUserId, at);
  }

  const [{ profileMap }, favoriteFriendIds] = await Promise.all([
    hydrateProfilesLabelsOnlyWithMap(viewer, friendIds),
    listFavoriteFriendTargetIds(sb, viewer, friendIds),
  ]);

  return buildProfilesFromKnownRelations({
    viewerId: viewer,
    targetIds: friendIds,
    profileMap,
    friendIds,
    favoriteFriendIds,
    friendshipAcceptedAtByPeer,
  });
}
