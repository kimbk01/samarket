import {
  getFriendshipSupabaseOrNull,
  isFriendshipMissingTableError,
  trimFriendshipText,
} from "@/lib/community-messenger/friendship/friendship-utils";

export async function cleanupCommunityMessengerFriendGraphOnBlock(
  blockerUserId: string,
  blockedUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const a = trimFriendshipText(blockerUserId);
  const b = trimFriendshipText(blockedUserId);
  if (!a || !b || a === b) return { ok: false, error: "bad_target" };
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: true };

  for (const [owner, target] of [
    [a, b],
    [b, a],
  ] as const) {
    await (sb as any)
      .from("user_social_relations")
      .delete()
      .eq("owner_user_id", owner)
      .eq("target_user_id", target)
      .eq("relation_type", "friend");
  }

  const { error: favoriteDeleteError } = await (sb as any)
    .from("community_friend_favorites")
    .delete()
    .or(`and(user_id.eq.${a},target_user_id.eq.${b}),and(user_id.eq.${b},target_user_id.eq.${a})`);
  if (favoriteDeleteError && !isFriendshipMissingTableError(favoriteDeleteError)) {
    return { ok: false, error: String(favoriteDeleteError.message ?? "friend_favorite_cleanup_failed") };
  }

  for (const [uid, tid] of [
    [a, b],
    [b, a],
  ] as const) {
    const { error: hiddenDeleteError } = await (sb as any)
      .from("user_relationships")
      .delete()
      .eq("user_id", uid)
      .eq("target_user_id", tid)
      .or("relation_type.eq.hidden,type.eq.hidden");
    if (hiddenDeleteError && !isFriendshipMissingTableError(hiddenDeleteError)) {
      return { ok: false, error: String(hiddenDeleteError.message ?? "friend_hidden_cleanup_failed") };
    }
  }

  return { ok: true };
}
