/**
 * CM friendship pair state — delegates to `resolveFriendshipPair` (Friendship SSOT Step 1).
 * @deprecated Prefer `resolveFriendshipPair` from `@/lib/community-messenger/friendship/resolve-friendship-pair`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import {
  resolveFriendshipPair,
  type FriendshipPairState,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";

export type { FriendshipPairState } from "@/lib/community-messenger/friendship/resolve-friendship-pair";

export type FriendshipPairResolution = {
  state: FriendshipPairState;
  source: "friendships_ssot" | "social_relations" | "legacy_requests" | "none";
  row?: FriendshipSsotRow | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

export async function getFriendshipPairState(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string,
  options?: { nowMs?: number }
): Promise<FriendshipPairResolution> {
  const resolved = await resolveFriendshipPair(sb, userId, targetUserId, options);
  return {
    state: resolved.state,
    source: resolved.source,
    row: resolved.row,
  };
}

/** UI·guard·group invite — viewer saved contact OR legacy accepted fallback (P1). */
export async function isAcceptedFriendPair(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string,
  options?: { nowMs?: number }
): Promise<boolean> {
  if (sb && (await isFriendSavedByOwner(sb, userId, targetUserId))) return true;
  const resolved = await resolveFriendshipPair(sb, userId, targetUserId, options);
  return resolved.state === "accepted";
}

async function isFriendSavedRow(
  sb: SupabaseClient<any>,
  ownerUserId: string,
  targetUserId: string
): Promise<boolean> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return false;
  const { data, error } = await (sb as any)
    .from("user_social_relations")
    .select("id")
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "friend")
    .maybeSingle();
  if (error && !isMissingTableError(error)) return false;
  return Boolean(data?.id);
}

/** viewer 기준 target 을 friend 로 저장했는지 (단방향) — not friendship SSOT judgment */
export async function isFriendSavedByOwner(
  sb: SupabaseClient<any> | null,
  ownerUserId: string,
  targetUserId: string
): Promise<boolean> {
  if (!sb) return false;
  return isFriendSavedRow(sb, ownerUserId, targetUserId);
}

export function peerFriendshipStateFromResolution(
  resolution: FriendshipPairResolution
): "accepted" | "pending" | "none" | "blocked" {
  if (resolution.state === "accepted") return "accepted";
  if (resolution.state === "pending") return "pending";
  if (resolution.state === "blocked" || resolution.state === "readd_cooldown" || resolution.state === "removed") {
    return "blocked";
  }
  return "none";
}
