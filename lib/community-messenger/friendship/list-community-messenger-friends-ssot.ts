/**
 * Friend List read path — viewer-local contact only (Telegram unilateral).
 * LOCK: docs/community-messenger/friend-contact-ssot-lock.md
 */

import {
  buildProfilesFromKnownRelations,
  hydrateProfilesLabelsOnlyWithMap,
} from "@/lib/community-messenger/service";
import { listHiddenUserRelationshipRowsResult } from "@/lib/community-messenger/social-relations";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listContactFriendPeersForViewerResult } from "@/lib/community-messenger/friendship/resolve-friendship-pair";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type ListCommunityMessengerFriendsResult =
  | { ok: true; friends: CommunityMessengerProfileLite[] }
  | { ok: false; error: string; code: "unavailable" | "db_error" };

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
  /** Favorites are additive UX — missing/error must not fail-open the friend list itself. */
  if (error) return [];
  return (data ?? [])
    .map((row: { target_user_id?: string | null }) => trimText(row.target_user_id))
    .filter(Boolean);
}

/** GET /api/community-messenger/friends — viewer contact saves only. F-11: DB 오류는 ok:false. */
export async function listCommunityMessengerFriendsFromSsot(
  userId: string,
  options?: { nowMs?: number }
): Promise<ListCommunityMessengerFriendsResult> {
  const viewer = trimText(userId);
  if (!viewer) return { ok: true, friends: [] };

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { ok: false, error: "service_unavailable", code: "unavailable" };

  const contactResult = await listContactFriendPeersForViewerResult(sb, viewer, options);
  if (!contactResult.ok) {
    return { ok: false, error: contactResult.error, code: "db_error" };
  }
  const contactPeers = contactResult.peers;
  if (!contactPeers.length) return { ok: true, friends: [] };

  const hiddenResult = await listHiddenUserRelationshipRowsResult(viewer);
  if (!hiddenResult.ok) {
    return { ok: false, error: hiddenResult.error, code: "db_error" };
  }
  const hiddenIdSet = new Set(hiddenResult.rows.map((row) => row.targetUserId));

  const friendIds = contactPeers
    .map((entry) => entry.peerUserId)
    .filter((peerId) => peerId && !hiddenIdSet.has(peerId));

  if (!friendIds.length) return { ok: true, friends: [] };

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

  return {
    ok: true,
    friends: buildProfilesFromKnownRelations({
      viewerId: viewer,
      targetIds: friendIds,
      profileMap,
      friendIds,
      favoriteFriendIds,
      friendshipAcceptedAtByPeer,
    }),
  };
}
