/**
 * CM friendship pair state — `community_messenger_friendships` SSOT 1순위.
 * `user_social_relations` mutual · legacy `community_friend_requests` 는 fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFriendshipPairRow, type FriendshipSsotRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";

export type FriendshipPairState =
  | "accepted"
  | "pending"
  | "blocked"
  | "removed"
  | "readd_cooldown"
  | "none";

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

function mapFriendshipsSsotStatus(row: FriendshipSsotRow, nowMs = Date.now()): FriendshipPairState {
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

export async function getFriendshipPairState(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string,
  options?: { nowMs?: number }
): Promise<FriendshipPairResolution> {
  const viewer = trimText(userId);
  const target = trimText(targetUserId);
  if (!viewer || !target || viewer === target) {
    return { state: "none", source: "none" };
  }
  if (!sb) return { state: "none", source: "none" };

  const nowMs = options?.nowMs ?? Date.now();
  try {
    const row = await fetchFriendshipPairRow(sb, viewer, target);
    if (row) {
      return {
        state: mapFriendshipsSsotStatus(row, nowMs),
        source: "friendships_ssot",
        row,
      };
    }
  } catch {
    /* fall through to legacy fallbacks */
  }

  if (await isMutualFriendSavedInSocialRelations(sb, viewer, target)) {
    return { state: "accepted", source: "social_relations" };
  }
  if (await hasLegacyAcceptedFriendRequest(sb, viewer, target)) {
    return { state: "accepted", source: "legacy_requests" };
  }

  return { state: "none", source: "none" };
}

/** UI·guard 공통 — accepted friend pair */
export async function isAcceptedFriendPair(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string,
  options?: { nowMs?: number }
): Promise<boolean> {
  const resolved = await getFriendshipPairState(sb, userId, targetUserId, options);
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

/** viewer 기준 target 을 friend 로 저장했는지 (단방향) */
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
