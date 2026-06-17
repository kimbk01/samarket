/**
 * CM social graph — Telegram-style 단방향 friend + block.
 * `community_friend_requests` 대체. friend ≠ 대화 허가, 연락처 저장만.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizeProfileUserSearchKeyword } from "@/lib/community-messenger/profile-user-search-filter";
import { recordMessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/server-store-record";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type MessengerDirectCallPolicy = "everyone" | "friends_only" | "none";

export type SocialRelationPublicProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  publicId: string | null;
};

export type DirectInteractionGuard = {
  canMessage: boolean;
  canCall: boolean;
  isFriend: boolean;
  isBlockedByMe: boolean;
  isBlockedByPeer: boolean;
  reason?: "self" | "blocked" | "restricted" | "call_policy";
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

function getSupabaseOrNull() {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

export function logSocialRelationEvent(metric: string, labels?: Record<string, string>): void {
  recordMessengerMonitoringEvent({
    ts: Date.now(),
    category: "api.community_messenger",
    metric,
    source: "server",
    unit: "count",
    value: 1,
    labels,
  });
}

export function logFriendRequestLegacyApiNotUsed(route: string): void {
  logSocialRelationEvent("friend_request_legacy_api_not_used", { route });
}

async function fetchBlockedPairsEitherWay(
  sb: ReturnType<typeof getSupabaseOrNull>,
  userId: string,
  targetUserId: string
): Promise<{ blockedByMe: boolean; blockedByPeer: boolean }> {
  if (!sb) return { blockedByMe: false, blockedByPeer: false };

  const [socialRes, legacyRes] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("owner_user_id, relation_type")
      .eq("relation_type", "blocked")
      .or(
        `and(owner_user_id.eq.${userId},target_user_id.eq.${targetUserId}),and(owner_user_id.eq.${targetUserId},target_user_id.eq.${userId})`
      ),
    (sb as any)
      .from("user_relationships")
      .select("user_id, target_user_id, relation_type, type")
      .or(
        `and(user_id.eq.${userId},target_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},target_user_id.eq.${userId})`
      )
      .or("relation_type.eq.blocked,type.eq.blocked"),
  ]);

  let blockedByMe = false;
  let blockedByPeer = false;

  for (const row of (socialRes.data ?? []) as Array<{ owner_user_id?: string }>) {
    const owner = trimText(row.owner_user_id);
    if (owner === userId) blockedByMe = true;
    if (owner === targetUserId) blockedByPeer = true;
  }
  for (const row of (legacyRes.data ?? []) as Array<{ user_id?: string }>) {
    const owner = trimText(row.user_id);
    if (owner === userId) blockedByMe = true;
    if (owner === targetUserId) blockedByPeer = true;
  }

  return { blockedByMe, blockedByPeer };
}

export async function isBlockedEitherWay(userId: string, targetUserId: string): Promise<boolean> {
  const a = trimText(userId);
  const b = trimText(targetUserId);
  if (!a || !b || a === b) return false;
  const sb = getSupabaseOrNull();
  const { blockedByMe, blockedByPeer } = await fetchBlockedPairsEitherWay(sb, a, b);
  return blockedByMe || blockedByPeer;
}

export async function listFriendSavedIds(ownerUserId: string): Promise<string[]> {
  const owner = trimText(ownerUserId);
  if (!owner) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];
  const { data, error } = await (sb as any)
    .from("user_social_relations")
    .select("target_user_id")
    .eq("owner_user_id", owner)
    .eq("relation_type", "friend");
  if (error && !isMissingTableError(error)) return [];
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ target_user_id?: string }>) {
    const id = trimText(row.target_user_id);
    if (id) out.add(id);
  }
  return [...out];
}

export async function isFriendSavedByMe(ownerUserId: string, targetUserId: string): Promise<boolean> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
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

export async function listBlockedByMeIds(ownerUserId: string): Promise<string[]> {
  const owner = trimText(ownerUserId);
  if (!owner) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];
  const ids = new Set<string>();

  const [socialRes, legacyRes] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("target_user_id")
      .eq("owner_user_id", owner)
      .eq("relation_type", "blocked"),
    (sb as any)
      .from("user_relationships")
      .select("target_user_id")
      .eq("user_id", owner)
      .or("relation_type.eq.blocked,type.eq.blocked"),
  ]);

  for (const row of (socialRes.data ?? []) as Array<{ target_user_id?: string }>) {
    const id = trimText(row.target_user_id);
    if (id) ids.add(id);
  }
  for (const row of (legacyRes.data ?? []) as Array<{ target_user_id?: string }>) {
    const id = trimText(row.target_user_id);
    if (id) ids.add(id);
  }
  return [...ids];
}

async function fetchProfileCallPolicy(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  userId: string
): Promise<MessengerDirectCallPolicy> {
  const { data } = await (sb as any)
    .from("profiles")
    .select("messenger_direct_call_policy, status")
    .eq("id", userId)
    .maybeSingle();
  const policy = trimText((data as { messenger_direct_call_policy?: string } | null)?.messenger_direct_call_policy);
  if (policy === "friends_only" || policy === "none") return policy;
  return "everyone";
}

async function isProfileRestricted(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  userId: string
): Promise<boolean> {
  const { data } = await (sb as any).from("profiles").select("status").eq("id", userId).maybeSingle();
  const status = trimText((data as { status?: string } | null)?.status).toLowerCase();
  return status === "suspended" || status === "deleted";
}

export async function resolveDirectInteractionGuard(
  viewerUserId: string,
  targetUserId: string
): Promise<DirectInteractionGuard> {
  const viewer = trimText(viewerUserId);
  const target = trimText(targetUserId);
  if (!viewer || !target) {
    return {
      canMessage: false,
      canCall: false,
      isFriend: false,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      reason: "restricted",
    };
  }
  if (viewer === target) {
    return {
      canMessage: false,
      canCall: false,
      isFriend: false,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      reason: "self",
    };
  }

  const sb = getSupabaseOrNull();
  if (!sb) {
    return {
      canMessage: false,
      canCall: false,
      isFriend: false,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      reason: "restricted",
    };
  }

  const [{ blockedByMe, blockedByPeer }, isFriend, targetRestricted, callPolicy] = await Promise.all([
    fetchBlockedPairsEitherWay(sb, viewer, target),
    isFriendSavedByMe(viewer, target),
    isProfileRestricted(sb, target),
    fetchProfileCallPolicy(sb, target),
  ]);

  if (blockedByMe || blockedByPeer) {
    return {
      canMessage: false,
      canCall: false,
      isFriend,
      isBlockedByMe: blockedByMe,
      isBlockedByPeer: blockedByPeer,
      reason: "blocked",
    };
  }

  if (targetRestricted) {
    return {
      canMessage: false,
      canCall: false,
      isFriend,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      reason: "restricted",
    };
  }

  let canCall = true;
  if (callPolicy === "none") canCall = false;
  if (callPolicy === "friends_only" && !isFriend) canCall = false;

  return {
    canMessage: true,
    canCall,
    isFriend,
    isBlockedByMe: false,
    isBlockedByPeer: false,
  };
}

export async function resolveUserByPublicId(
  publicIdRaw: string
): Promise<SocialRelationPublicProfile | null> {
  const keyword = normalizeProfileUserSearchKeyword(publicIdRaw);
  if (!keyword) return null;
  const sb = getSupabaseOrNull();
  if (!sb) return null;

  const { data: byDibay } = await (sb as any)
    .from("profiles")
    .select("id, display_name, nickname, username, dibay_id, avatar_url")
    .ilike("dibay_id", keyword)
    .limit(1)
    .maybeSingle();

  let row = byDibay as Record<string, unknown> | null;
  if (!row?.id) {
    const { data: byUsername } = await (sb as any)
      .from("profiles")
      .select("id, display_name, nickname, username, dibay_id, avatar_url")
      .ilike("username", keyword)
      .eq("username_confirmed", true)
      .limit(1)
      .maybeSingle();
    row = byUsername as Record<string, unknown> | null;
  }
  if (!row?.id) return null;

  const id = trimText(row.id);
  const display =
    trimText(row.display_name) || trimText(row.nickname) || trimText(row.username) || id;
  const publicId = trimText(row.dibay_id) || trimText(row.username) || null;
  return {
    id,
    displayName: display,
    avatarUrl: trimText(row.avatar_url) || null,
    publicId,
  };
}

async function syncLegacyBlockRow(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  ownerUserId: string,
  targetUserId: string,
  blocked: boolean
): Promise<void> {
  if (blocked) {
    const { data: ex } = await (sb as any)
      .from("user_relationships")
      .select("id")
      .eq("user_id", ownerUserId)
      .eq("target_user_id", targetUserId)
      .or("relation_type.eq.blocked,type.eq.blocked")
      .maybeSingle();
    if (!ex?.id) {
      await (sb as any).from("user_relationships").insert({
        user_id: ownerUserId,
        target_user_id: targetUserId,
        type: "blocked",
        relation_type: "blocked",
      });
    }
    return;
  }
  await (sb as any)
    .from("user_relationships")
    .delete()
    .eq("user_id", ownerUserId)
    .eq("target_user_id", targetUserId)
    .or("relation_type.eq.blocked,type.eq.blocked");
}

export async function addFriendSaved(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return { ok: false, error: "bad_target" };
  if (await isBlockedEitherWay(owner, target)) return { ok: false, error: "blocked_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const { data: existing } = await (sb as any)
    .from("user_social_relations")
    .select("id, relation_type")
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .maybeSingle();

  if (existing?.relation_type === "friend") {
    return { ok: true };
  }
  if (existing?.relation_type === "blocked") {
    return { ok: false, error: "blocked_target" };
  }

  const { error } = await (sb as any).from("user_social_relations").insert({
    owner_user_id: owner,
    target_user_id: target,
    relation_type: "friend",
  });
  if (error) return { ok: false, error: String(error.message ?? "friend_add_failed") };

  logSocialRelationEvent("social_relation_friend_added", { ownerUserId: owner, targetUserId: target });
  return { ok: true };
}

export async function removeFriendSaved(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const { error } = await (sb as any)
    .from("user_social_relations")
    .delete()
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "friend");
  if (error) return { ok: false, error: String(error.message ?? "friend_remove_failed") };

  logSocialRelationEvent("social_relation_friend_removed", { ownerUserId: owner, targetUserId: target });
  return { ok: true };
}

export async function blockUserSocial(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  await (sb as any)
    .from("user_social_relations")
    .delete()
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "friend");

  const { error } = await (sb as any)
    .from("user_social_relations")
    .upsert(
      {
        owner_user_id: owner,
        target_user_id: target,
        relation_type: "blocked",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id,target_user_id" }
    );
  if (error) return { ok: false, error: String(error.message ?? "block_failed") };

  await syncLegacyBlockRow(sb, owner, target, true);

  const { error: favErr } = await (sb as any)
    .from("community_friend_favorites")
    .delete()
    .or(`and(user_id.eq.${owner},target_user_id.eq.${target}),and(user_id.eq.${target},target_user_id.eq.${owner})`);
  if (favErr && !isMissingTableError(favErr)) {
    /* non-fatal */
  }

  logSocialRelationEvent("social_relation_blocked", { ownerUserId: owner, targetUserId: target });
  return { ok: true };
}

export async function unblockUserSocial(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const { error } = await (sb as any)
    .from("user_social_relations")
    .delete()
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "blocked");
  if (error) return { ok: false, error: String(error.message ?? "unblock_failed") };

  await syncLegacyBlockRow(sb, owner, target, false);

  logSocialRelationEvent("social_relation_unblocked", { ownerUserId: owner, targetUserId: target });
  return { ok: true };
}

export async function fetchFriendSavedAtByPeerId(
  ownerUserId: string
): Promise<Map<string, string>> {
  const owner = trimText(ownerUserId);
  const map = new Map<string, string>();
  if (!owner) return map;
  const sb = getSupabaseOrNull();
  if (!sb) return map;
  const { data } = await (sb as any)
    .from("user_social_relations")
    .select("target_user_id, created_at")
    .eq("owner_user_id", owner)
    .eq("relation_type", "friend");
  for (const row of (data ?? []) as Array<{ target_user_id?: string; created_at?: string }>) {
    const peer = trimText(row.target_user_id);
    const at = trimText(row.created_at);
    if (peer && at) map.set(peer, at);
  }
  return map;
}

export type FriendSavedAcceptedRow = {
  requester_id: string;
  addressee_id: string;
  status: "accepted";
  created_at?: string;
  responded_at?: string | null;
};

/** bootstrap `acceptedPeerIdsFromCommunityFriendRows` 호환 synthetic rows */
export async function fetchFriendSavedAcceptedRowsForViewer(
  ownerUserId: string
): Promise<FriendSavedAcceptedRow[]> {
  const owner = trimText(ownerUserId);
  if (!owner) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];
  const { data, error } = await (sb as any)
    .from("user_social_relations")
    .select("target_user_id, created_at")
    .eq("owner_user_id", owner)
    .eq("relation_type", "friend");
  if (error && !isMissingTableError(error)) return [];
  return ((data ?? []) as Array<{ target_user_id?: string; created_at?: string }>)
    .map((row) => {
      const target = trimText(row.target_user_id);
      const at = trimText(row.created_at);
      if (!target) return null;
      const out: FriendSavedAcceptedRow = {
        requester_id: owner,
        addressee_id: target,
        status: "accepted",
        responded_at: at || null,
      };
      if (at) out.created_at = at;
      return out;
    })
    .filter((row): row is FriendSavedAcceptedRow => row !== null);
}
