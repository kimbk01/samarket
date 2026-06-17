import "server-only";
import { COMMUNITY_MESSENGER_FRIENDSHIP_READD_BLOCK_MS } from "@/lib/community-messenger/friendship/constants";
import { loadFriendshipRow } from "@/lib/community-messenger/friendship/friendship-repository";
import {
  friendshipNowIso,
  getFriendshipSupabaseOrNull,
  trimFriendshipText,
} from "@/lib/community-messenger/friendship/friendship-utils";
import type {
  FriendshipActionResult,
  FriendshipProfileHydrator,
} from "@/lib/community-messenger/friendship/types";
import { assertCanUnblockFriend } from "@/lib/community-messenger/friendship/friendship-permission-guards";
import { cleanupCommunityMessengerFriendGraphOnBlock } from "@/lib/community-messenger/friendship/friendship-graph-cleanup";
import { blockUserSocial, unblockUserSocial } from "@/lib/community-messenger/social-relations";

export async function blockCommunityMessengerFriendship(
  userId: string,
  targetUserId: string
): Promise<FriendshipActionResult> {
  const blocker = trimFriendshipText(userId);
  const target = trimFriendshipText(targetUserId);
  if (!blocker || !target || blocker === target) return { ok: false, error: "bad_target" };
  console.info("[friend-flow] block_start", { blockerUserId: blocker, targetUserId: target });
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };

  const now = new Date();
  const blockedAt = now.toISOString();
  const readdBlockedUntil = new Date(now.getTime() + COMMUNITY_MESSENGER_FRIENDSHIP_READD_BLOCK_MS).toISOString();
  const existing = await loadFriendshipRow(sb, blocker, target);
  let friendshipId = existing?.id ?? "";

  if (friendshipId) {
    const { error } = await (sb as any)
      .from("community_messenger_friendships")
      .update({
        status: "blocked",
        blocked_by_user_id: blocker,
        blocked_at: blockedAt,
        readd_blocked_until: readdBlockedUntil,
        updated_at: blockedAt,
      })
      .eq("id", friendshipId);
    if (error) return { ok: false, error: String(error.message ?? "friendship_block_failed") };
  } else {
    const { data, error } = await (sb as any)
      .from("community_messenger_friendships")
      .insert({
        requester_user_id: blocker,
        addressee_user_id: target,
        status: "blocked",
        blocked_by_user_id: blocker,
        blocked_at: blockedAt,
        readd_blocked_until: readdBlockedUntil,
        created_at: blockedAt,
        updated_at: blockedAt,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? "friendship_block_failed") };
    friendshipId = trimFriendshipText((data as { id?: string } | null)?.id);
  }

  await Promise.all([blockUserSocial(blocker, target), cleanupCommunityMessengerFriendGraphOnBlock(blocker, target)]);
  console.info("[friend-flow] block_done", { blockerUserId: blocker, targetUserId: target, friendshipId });
  return { ok: true, friendshipId, targetUserId: target, readdBlockedUntil };
}

export async function unblockCommunityMessengerFriendship(
  userId: string,
  targetUserId: string
): Promise<FriendshipActionResult> {
  const viewer = trimFriendshipText(userId);
  const target = trimFriendshipText(targetUserId);
  if (!viewer || !target || viewer === target) return { ok: false, error: "bad_target" };
  console.info("[friend-flow] unblock_start", { viewerUserId: viewer, targetUserId: target });

  const gate = await assertCanUnblockFriend({ viewerUserId: viewer, peerUserId: target });
  if (!gate.ok) {
    return { ok: false, error: gate.error === "forbidden" ? "forbidden" : "blocked_relation_not_found" };
  }

  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const existing = await loadFriendshipRow(sb, viewer, target);
  const now = friendshipNowIso();
  const { error } = await (sb as any)
    .from("community_messenger_friendships")
    .update({
      status: "removed",
      blocked_by_user_id: null,
      unblocked_at: now,
      removed_at: now,
      updated_at: now,
    })
    .eq("id", gate.friendshipId)
    .eq("status", "blocked")
    .eq("blocked_by_user_id", viewer);
  if (error) return { ok: false, error: String(error.message ?? "friendship_unblock_failed") };
  await unblockUserSocial(viewer, target);
  console.info("[friend-flow] unblock_done", { viewerUserId: viewer, targetUserId: target });
  return {
    ok: true,
    friendshipId: gate.friendshipId,
    targetUserId: target,
    readdBlockedUntil: existing?.readdBlockedUntil ?? null,
  };
}

export async function listCommunityMessengerBlockedFriendships(
  userId: string,
  hydrateProfiles: FriendshipProfileHydrator
): Promise<
  Array<{
    friendshipId: string;
    blockedAt: string | null;
    readdBlockedUntil: string | null;
    profile: { id: string; label: string; avatarUrl: string | null };
  }>
> {
  const viewer = trimFriendshipText(userId);
  if (!viewer) return [];
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return [];
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select("id, requester_user_id, addressee_user_id, blocked_at, readd_blocked_until")
    .eq("status", "blocked")
    .eq("blocked_by_user_id", viewer)
    .order("blocked_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    id?: string;
    requester_user_id?: string;
    addressee_user_id?: string;
    blocked_at?: string | null;
    readd_blocked_until?: string | null;
  }>;
  const peerIds = [
    ...new Set(
      rows.map((row) =>
        trimFriendshipText(row.requester_user_id) === viewer
          ? trimFriendshipText(row.addressee_user_id)
          : trimFriendshipText(row.requester_user_id)
      )
    ),
  ].filter(Boolean);
  const profiles = await hydrateProfiles(viewer, peerIds);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.flatMap((row) => {
    const peerId =
      trimFriendshipText(row.requester_user_id) === viewer
        ? trimFriendshipText(row.addressee_user_id)
        : trimFriendshipText(row.requester_user_id);
    const profile = byId.get(peerId);
    if (!profile) return [];
    return [
      {
        friendshipId: trimFriendshipText(row.id),
        blockedAt: row.blocked_at ?? null,
        readdBlockedUntil: row.readd_blocked_until ?? null,
        profile,
      },
    ];
  });
}
