/**
 * CM social graph — **단방향 연락처 친구** + 한 방향 차단 (요청·수락 없음).
 * friend = 내(owner)→상대(target) `user_social_relations.relation_type=friend` 1행. 상대 쪽 행은 만들거나 지우지 않는다.
 * LOCK: docs/community-messenger/friend-contact-ssot-lock.md
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  escapeIlikePatternFragment,
  normalizeProfileUserSearchKeyword,
} from "@/lib/community-messenger/profile-user-search-filter";
import { recordMessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/server-store-record";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  fetchBlockedPairFromSb,
  type BlockedRelation,
} from "@/lib/social/user-block-ssot";
import type { BlockSource } from "@/lib/social/block-ssot-types";
import { isActiveSocialBlockRow, SOCIAL_BLOCK_ACTIVE_OR_LEGACY } from "@/lib/social/block-ssot-types";
import {
  canStartDirectCallBetweenUsers,
  resolveDirectCallPolicy,
  type DirectCallPolicy,
  logCallPermission,
} from "@/lib/community-messenger/direct-call-permission";
import {
  matchesPublicIdExactly,
  resolveExactLookupPublicId,
  type ProfilePublicIdFields,
} from "@/lib/auth/dibay-public-id-ssot";
import { getFriendshipPairState, isAcceptedFriendPair } from "@/lib/community-messenger/friendship-resolver";
import { invalidateBootstrapLiteSocialDeferredForPair } from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import { restoreDirectRoomsOnUnblockForViewer } from "@/lib/community-messenger/participant-block-hide";
import { MessengerSocialGraphReadError } from "@/lib/community-messenger/friendship/social-graph-read-error";

export type { BlockSource } from "@/lib/social/block-ssot-types";

export type MessengerDirectCallPolicy = DirectCallPolicy;

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

/** Postgres unique_violation (23505) — 동시 insert 경합 */
export function isUniqueViolationError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "");
  if (code === "23505") return true;
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /duplicate key value violates unique constraint/i.test(msg);
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
  const rel = await fetchBlockedPairFromSb(sb, userId, targetUserId);
  return { blockedByMe: rel.blockedByMe, blockedByPeer: rel.blockedByPeer };
}

export async function getBlockedRelation(userId: string, targetUserId: string): Promise<BlockedRelation> {
  const sb = getSupabaseOrNull();
  return fetchBlockedPairFromSb(sb, userId, targetUserId);
}

export async function isBlockedByOther(viewerUserId: string, targetUserId: string): Promise<boolean> {
  const rel = await getBlockedRelation(viewerUserId, targetUserId);
  return rel.blockedByPeer;
}

export async function isBlockedEitherWay(userId: string, targetUserId: string): Promise<boolean> {
  return isBlockedEitherWayActive(userId, targetUserId);
}

/** SSOT active block — `user_social_relations.relation_type=blocked` AND `is_active !== false` (+ legacy fallback) */
export async function isBlockedEitherWayActive(
  userId: string,
  targetUserId: string,
  supabase?: import("@supabase/supabase-js").SupabaseClient<any> | null
): Promise<boolean> {
  const a = trimText(userId);
  const b = trimText(targetUserId);
  if (!a || !b || a === b) return false;
  const sb = supabase ?? getSupabaseOrNull();
  const rel = await fetchBlockedPairFromSb(sb, a, b);
  return rel.blockedEitherWay;
}

/** 내가 대상을 차단했는지 (`user_social_relations` + legacy `user_relationships`) */
export async function isBlockedByMe(ownerUserId: string, targetUserId: string): Promise<boolean> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return false;
  const sb = getSupabaseOrNull();
  const { blockedByMe } = await fetchBlockedPairsEitherWay(sb, owner, target);
  return blockedByMe;
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
  if (error) {
    /** F-11 — DB 오류를 빈 목록으로 삼키지 않는다 (테이블 미적용만 빈 목록) */
    if (isMissingTableError(error)) return [];
    throw new MessengerSocialGraphReadError("friend_saved_ids", error);
  }
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

/** 승인·accepted friend pair — friendships SSOT 1순위 (UI `isFriend` 기준) */
export async function isMutualFriend(userId: string, targetUserId: string): Promise<boolean> {
  const viewer = trimText(userId);
  const target = trimText(targetUserId);
  if (!viewer || !target || viewer === target) return false;
  const sb = getSupabaseOrNull();
  return isAcceptedFriendPair(sb, viewer, target);
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
      .select("target_user_id, is_active, relation_type")
      .eq("owner_user_id", owner)
      .eq("relation_type", "blocked")
      .or(SOCIAL_BLOCK_ACTIVE_OR_LEGACY),
    (sb as any)
      .from("user_relationships")
      .select("target_user_id")
      .eq("user_id", owner)
      .or("relation_type.eq.blocked,type.eq.blocked"),
  ]);

  for (const row of (socialRes.data ?? []) as Array<{
    target_user_id?: string;
    is_active?: boolean | null;
    relation_type?: string;
  }>) {
    if (!isActiveSocialBlockRow(row)) continue;
    const id = trimText(row.target_user_id);
    if (id) ids.add(id);
  }
  for (const row of (legacyRes.data ?? []) as Array<{ target_user_id?: string }>) {
    const id = trimText(row.target_user_id);
    if (id) ids.add(id);
  }
  return [...ids];
}

export type HiddenUserRelationshipRow = {
  id: string;
  targetUserId: string;
  createdAt: string;
};

/** CM·마이페이지 숨김 SSOT — `user_relationships.relation_type=hidden` */
export async function listHiddenUserRelationshipRows(
  ownerUserId: string
): Promise<HiddenUserRelationshipRow[]> {
  const owner = trimText(ownerUserId);
  if (!owner) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];

  const { data, error } = await (sb as any)
    .from("user_relationships")
    .select("id, target_user_id, created_at")
    .eq("user_id", owner)
    .or("relation_type.eq.hidden,type.eq.hidden")
    .order("created_at", { ascending: false });

  if (error) {
    /** F-11 — 오류를 빈 목록으로 처리하면 숨긴 친구가 다시 보인다 → throw, 라우트 5xx */
    if (isMissingTableError(error)) return [];
    throw new MessengerSocialGraphReadError("hidden_relations", error);
  }

  return ((data ?? []) as Array<{ id?: string; target_user_id?: string; created_at?: string }>)
    .map((row) => ({
      id: trimText(row.id),
      targetUserId: trimText(row.target_user_id),
      createdAt: trimText(row.created_at),
    }))
    .filter((row) => row.id && row.targetUserId);
}

export async function removeHiddenUserRelationshipById(
  ownerUserId: string,
  relationId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const id = trimText(relationId);
  if (!owner || !id) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const { error } = await (sb as any)
    .from("user_relationships")
    .delete()
    .eq("id", id)
    .eq("user_id", owner)
    .or("relation_type.eq.hidden,type.eq.hidden");

  if (error) {
    if (isMissingTableError(error)) return { ok: true };
    return { ok: false, error: String(error.message ?? "hidden_remove_failed") };
  }

  logSocialRelationEvent("social_relation_hidden_removed", { ownerUserId: owner, relationId: id });
  invalidateBootstrapLiteSocialDeferredForPair(owner, null);
  return { ok: true };
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
  return resolveDirectCallPolicy((data as { messenger_direct_call_policy?: string } | null)?.messenger_direct_call_policy);
}

async function isProfileRestricted(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  userId: string
): Promise<boolean> {
  const { data } = await (sb as any).from("profiles").select("status").eq("id", userId).maybeSingle();
  const status = trimText((data as { status?: string } | null)?.status).toLowerCase();
  return status === "suspended" || status === "deleted" || status === "blocked";
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

  const [{ blockedByMe, blockedByPeer }, friendshipResolution, targetRestricted] = await Promise.all([
    fetchBlockedPairsEitherWay(sb, viewer, target),
    getFriendshipPairState(sb, viewer, target),
    isProfileRestricted(sb, target),
  ]);
  const isFriend = friendshipResolution.state === "accepted";

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

  const callGate = await canStartDirectCallBetweenUsers({
    callerUserId: viewer,
    calleeUserId: target,
    callKind: "audio",
    supabase: sb,
    skipRoomCheck: true,
    friendshipPreload: friendshipResolution,
  });

  return {
    canMessage: true,
    canCall: callGate.allowed,
    isFriend,
    isBlockedByMe: false,
    isBlockedByPeer: false,
    ...(!callGate.allowed ? { reason: "call_policy" as const } : {}),
  };
}

export async function resolveUserByPublicId(
  publicIdRaw: string
): Promise<SocialRelationPublicProfile | null> {
  const keyword = normalizeProfileUserSearchKeyword(publicIdRaw);
  if (!keyword) return null;
  const sb = getSupabaseOrNull();
  if (!sb) return null;

  /** `_`·`%` 는 ilike 와일드카드 — 이스케이프해야 다른 회원 id 와 오매칭되지 않는다 */
  const exactPattern = escapeIlikePatternFragment(keyword);
  const { data: byDibay } = await (sb as any)
    .from("profiles")
    .select("id, display_name, nickname, username, dibay_id, dibay_id_locked, username_confirmed, avatar_url")
    .ilike("dibay_id", exactPattern)
    .limit(1)
    .maybeSingle();

  let row = byDibay as Record<string, unknown> | null;
  if (!row?.id) {
    const { data: byUsername } = await (sb as any)
      .from("profiles")
      .select("id, display_name, nickname, username, dibay_id, dibay_id_locked, username_confirmed, avatar_url")
      .ilike("username", exactPattern)
      .eq("username_confirmed", true)
      .limit(1)
      .maybeSingle();
    row = byUsername as Record<string, unknown> | null;
  }
  if (!row?.id) return null;

  const id = trimText(row.id);
  const display =
    trimText(row.nickname) || trimText(row.display_name) || trimText(row.username) || id;
  const publicIdFields: ProfilePublicIdFields = {
    dibay_id: trimText(row.dibay_id) || null,
    dibay_id_locked: row.dibay_id_locked === true ? true : row.dibay_id_locked === false ? false : null,
    username: trimText(row.username) || null,
    username_confirmed:
      row.username_confirmed === true ? true : row.username_confirmed === false ? false : null,
  };
  /** 정확 일치 조회 — auto-assigned 기본 아이디 포함 (정책 B) */
  if (!matchesPublicIdExactly(publicIdFields, keyword)) return null;
  const publicId = resolveExactLookupPublicId(publicIdFields);
  if (!publicId) return null;
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
  /** SSOT 저장 후 legacy `user_relationships` 동기화 — 마이그레이션 기간 보조. TODO: backfill 완료 후 제거 */
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
  /**
   * legacy `user_blocks` (released_at IS NULL) 도 `fetchBlockedPairFromSb` fallback 에서 활성 차단으로 읽힌다.
   * 해제 시 함께 release 하지 않으면 SSOT 해제 후에도 차단이 유지된다 — 해제 이력 보존(released_at) 방식.
   */
  const { error: legacyBlocksErr } = await (sb as any)
    .from("user_blocks")
    .update({ released_at: new Date().toISOString() })
    .eq("user_id", ownerUserId)
    .eq("blocked_user_id", targetUserId)
    .is("released_at", null);
  if (legacyBlocksErr && !isMissingTableError(legacyBlocksErr)) {
    console.warn("[social-relations] legacy user_blocks release failed", {
      ownerUserId,
      targetUserId,
      message: String(legacyBlocksErr.message ?? ""),
    });
  }
}

export async function syncMutualFriendSavedAfterAccept(
  requesterId: string,
  addresseeId: string
): Promise<{ ok: boolean; partial?: boolean }> {
  const requester = trimText(requesterId);
  const addressee = trimText(addresseeId);
  if (!requester || !addressee) return { ok: false };

  const runBoth = async () => {
    const [ab, ba] = await Promise.all([
      addFriendSaved(requester, addressee),
      addFriendSaved(addressee, requester),
    ]);
    return { ab, ba };
  };

  let { ab, ba } = await runBoth();
  if (ab.ok && ba.ok) return { ok: true };

  logSocialRelationEvent("friend_sync_partial", {
    requesterId: requester,
    addresseeId: addressee,
    abError: ab.error ?? "",
    baError: ba.error ?? "",
  });
  logCallPermission("evaluate_start", {
    callerUserId: requester,
    calleeUserId: addressee,
    reason: "friend_sync_retry",
  });

  ({ ab, ba } = await runBoth());
  const ok = ab.ok && ba.ok;
  if (!ok) {
    console.warn("[call-permission] friend_sync_partial_after_retry", {
      requesterId: requester,
      addresseeId: addressee,
      abError: ab.error,
      baError: ba.error,
    });
  }
  return { ok, partial: !ok };
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
    .select("id, relation_type, is_active")
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .maybeSingle();

  if (existing?.relation_type === "friend") {
    return { ok: true };
  }
  if (isActiveSocialBlockRow(existing)) {
    return { ok: false, error: "blocked_target" };
  }
  if (existing?.relation_type === "blocked") {
    /**
     * 해제된 차단 이력(is_active=false) — 차단 아님. UNIQUE(owner_user_id,target_user_id) 단일 row 모델이라
     * insert 는 충돌하므로 같은 row 를 friend 로 전환한다 (재차단 경합 방지: inactive blocked 조건부 update).
     */
    const now = new Date().toISOString();
    const { data: converted, error: convertError } = await (sb as any)
      .from("user_social_relations")
      .update({
        relation_type: "friend",
        is_active: true,
        created_at: now,
        last_action_at: now,
        updated_at: now,
      })
      .eq("owner_user_id", owner)
      .eq("target_user_id", target)
      .eq("relation_type", "blocked")
      .eq("is_active", false)
      .select("id");
    if (convertError) {
      /** F-5 — DB 원문 비노출 (서버 로그만) */
      console.warn("[social-relations] friend convert failed", { code: (convertError as { code?: string }).code });
      return { ok: false, error: "friend_add_failed" };
    }
    if (!Array.isArray(converted) || converted.length === 0) {
      /** 동시에 재차단되었거나 row 상태가 바뀜 — 안전하게 차단으로 간주 */
      return { ok: false, error: "blocked_target" };
    }
    logSocialRelationEvent("social_relation_friend_added", { ownerUserId: owner, targetUserId: target });
    invalidateBootstrapLiteSocialDeferredForPair(owner, target);
    return { ok: true };
  }

  const { error } = await (sb as any).from("user_social_relations").insert({
    owner_user_id: owner,
    target_user_id: target,
    relation_type: "friend",
  });
  if (error) {
    if (isUniqueViolationError(error)) {
      /**
       * F-5 — 연타·두 기기 동시 추가: 다른 요청이 같은 (owner,target) 행을 먼저 만들었다.
       * 그 행이 friend 면 성공(멱등), 동시에 차단으로 바뀐 경우는 차단으로 응답한다.
       */
      const { data: raced } = await (sb as any)
        .from("user_social_relations")
        .select("id, relation_type, is_active")
        .eq("owner_user_id", owner)
        .eq("target_user_id", target)
        .maybeSingle();
      if (raced?.relation_type === "friend") return { ok: true };
      if (raced?.relation_type === "blocked") return { ok: false, error: "blocked_target" };
    }
    /** DB 원문(error.message)은 사용자에게 내보내지 않는다 */
    console.warn("[social-relations] friend insert failed", { code: (error as { code?: string }).code });
    return { ok: false, error: "friend_add_failed" };
  }

  logSocialRelationEvent("social_relation_friend_added", { ownerUserId: owner, targetUserId: target });
  invalidateBootstrapLiteSocialDeferredForPair(owner, target);
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
  invalidateBootstrapLiteSocialDeferredForPair(owner, target);
  return { ok: true };
}

export async function blockUserSocial(
  ownerUserId: string,
  targetUserId: string,
  options?: { blockSource?: BlockSource; blockReason?: string }
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const now = new Date().toISOString();

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
        is_active: true,
        blocked_at: now,
        unblocked_at: null,
        last_action_at: now,
        updated_at: now,
        block_source: options?.blockSource ?? "profile",
        ...(options?.blockReason ? { block_reason: options.blockReason } : {}),
      },
      { onConflict: "owner_user_id,target_user_id" }
    );
  if (error) return { ok: false, error: String(error.message ?? "block_failed") };

  await syncLegacyBlockRow(sb, owner, target, true);

  /** F-3 — 차단한 사람(owner) 소유 즐겨찾기만 정리. 상대 소유 행을 지우면 차단 사실이 드러난다 */
  const { error: favErr } = await (sb as any)
    .from("community_friend_favorites")
    .delete()
    .eq("user_id", owner)
    .eq("target_user_id", target);
  if (favErr && !isMissingTableError(favErr)) {
    /* non-fatal */
  }

  logSocialRelationEvent("social_relation_blocked", {
    ownerUserId: owner,
    targetUserId: target,
    blockSource: options?.blockSource ?? "",
  });
  /** lite social 캐시(blockedIds·acceptedFriendRows) 즉시 무효화 — 차단 직후 목록 누락/친구 재등장 방지 */
  invalidateBootstrapLiteSocialDeferredForPair(owner, target);
  return { ok: true };
}

export type UnblockUserSocialResult = {
  ok: boolean;
  error?: string;
  wasActive?: boolean;
  /** F-1 — 해제 후 다시 보이게 된 일반 1:1 방 (모든 해제 경로 공통) */
  restoredRoomIds?: string[];
};

/**
 * F-1 — 차단 해제 단일 진입점. 저장 성공 시 **항상** 일반 1:1 방 숨김을 복원한다
 * (마이페이지·거래 채팅·메신저 등 어떤 해제 경로도 라우트에서 따로 복원 호출하지 않는다).
 */
export async function unblockUserSocial(
  ownerUserId: string,
  targetUserId: string
): Promise<UnblockUserSocialResult> {
  const result = await unblockUserSocialRelationOnly(ownerUserId, targetUserId);
  if (!result.ok) return result;
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  const restore = await restoreDirectRoomsOnUnblockForViewer(owner, target);
  if (!restore.ok) {
    /** 해제 자체는 저장됨 — 복원 실패는 응답을 실패로 바꾸지 않고 기록만 한다 */
    logSocialRelationEvent("social_relation_unblock_restore_failed", {
      ownerUserId: owner,
      targetUserId: target,
      error: restore.error ?? "",
    });
  }
  return { ...result, restoredRoomIds: restore.restoredRoomIds };
}

async function unblockUserSocialRelationOnly(
  ownerUserId: string,
  targetUserId: string
): Promise<UnblockUserSocialResult> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const now = new Date().toISOString();

  const { data: existing } = await (sb as any)
    .from("user_social_relations")
    .select("id, is_active, relation_type")
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "blocked")
    .maybeSingle();

  if (!existing?.id) {
    await syncLegacyBlockRow(sb, owner, target, false);
    invalidateBootstrapLiteSocialDeferredForPair(owner, target);
    return { ok: true, wasActive: false };
  }

  if (existing.is_active === false) {
    /**
     * SSOT 는 이미 해제 — 그래도 legacy `user_relationships.blocked`/`user_blocks` 잔존 행은 정리한다.
     * `listBlockedByMeIds` 가 legacy 행을 union 하므로 남아 있으면 해제 후에도 차단 목록에 계속 보인다.
     */
    await syncLegacyBlockRow(sb, owner, target, false);
    invalidateBootstrapLiteSocialDeferredForPair(owner, target);
    return { ok: true, wasActive: false };
  }

  const { error } = await (sb as any)
    .from("user_social_relations")
    .update({
      is_active: false,
      unblocked_at: now,
      last_action_at: now,
      updated_at: now,
    })
    .eq("owner_user_id", owner)
    .eq("target_user_id", target)
    .eq("relation_type", "blocked");
  if (error) return { ok: false, error: String(error.message ?? "unblock_failed") };

  await syncLegacyBlockRow(sb, owner, target, false);

  logSocialRelationEvent("social_relation_unblocked", { ownerUserId: owner, targetUserId: target });
  invalidateBootstrapLiteSocialDeferredForPair(owner, target);
  return { ok: true, wasActive: true };
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
