/**
 * CM social graph — 승인 기반 mutual friend + block.
 * friend = 양쪽 모두 friend 저장(수락 후). @id 검색·방 상단에서 즉시 추가 금지.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizeProfileUserSearchKeyword } from "@/lib/community-messenger/profile-user-search-filter";
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
import { getFriendshipPairState, isAcceptedFriendPair } from "@/lib/community-messenger/friendship-resolver";
import { invalidateBootstrapLiteSocialDeferredForPair } from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";

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
  /** 내가 보낸 친구 요청을 상대가 거절함 — 상대에게 대화·통화·재요청 불가(1단계 문서 §14-5) */
  isRejectedByPeer?: boolean;
  reason?: "self" | "blocked" | "restricted" | "call_policy" | "rejected";
};

/**
 * §14-5 정책 (Owner 2026-10-25 승인, 메신저 표준 기준): 상대가 내 친구 요청을 **거절**하면
 * 요청자 → 거절한 사람 방향 대화·통화·재요청 불가. 거절한 사람 쪽은 막지 않고, 보관함에서 해제하면 풀린다.
 * 판정 원천: `community_friend_requests` (requester=viewer, addressee=peer, status='rejected').
 */
export async function fetchFriendRequestRejectedByPeer(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  requesterUserId: string,
  addresseeUserId: string
): Promise<boolean> {
  const requester = trimText(requesterUserId);
  const addressee = trimText(addresseeUserId);
  if (!requester || !addressee || requester === addressee) return false;
  const { data, error } = await (sb as any)
    .from("community_friend_requests")
    .select("id")
    .eq("requester_id", requester)
    .eq("addressee_id", addressee)
    .eq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * §17 R-2: 두 사람 사이 대기 중 친구 요청 — 방 스냅샷 표시 전용(읽기만).
 * `resolveFriendshipPair`(통화 권한 friendshipPreload 공유)는 바꾸지 않고 방 화면 projection 에만 쓴다.
 */
export async function fetchPendingFriendRequestBetween(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  viewerUserId: string,
  peerUserId: string
): Promise<{ id: string; direction: "outgoing_pending" | "incoming_pending" } | null> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer || viewer === peer) return null;
  const { data, error } = await (sb as any)
    .from("community_friend_requests")
    .select("id, requester_id")
    .eq("status", "pending")
    .or(`and(requester_id.eq.${viewer},addressee_id.eq.${peer}),and(requester_id.eq.${peer},addressee_id.eq.${viewer})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id?: string | null; requester_id?: string | null };
  const id = trimText(row.id);
  if (!id) return null;
  return { id, direction: trimText(row.requester_id) === viewer ? "outgoing_pending" : "incoming_pending" };
}

/**
 * §15-3: 내 친구 요청을 거절한 상대 id 목록 — 목록 행 「대화·통화 불가」 배지용(같은 판정 원천, 읽기만).
 * 실패 시 null(모름) — 빈 배열(「아무도 거절 안 함」)과 구분한다.
 */
export async function listPeerIdsWhoRejectedMyFriendRequest(requesterUserId: string): Promise<string[] | null> {
  const requester = trimText(requesterUserId);
  const sb = getSupabaseOrNull();
  if (!requester || !sb) return null;
  const { data, error } = await (sb as any)
    .from("community_friend_requests")
    .select("addressee_id")
    .eq("requester_id", requester)
    .eq("status", "rejected")
    .limit(500);
  if (error) return null;
  return [...new Set(((data ?? []) as { addressee_id?: string | null }[]).map((r) => trimText(r.addressee_id)).filter(Boolean))];
}

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
  if (error && !isMissingTableError(error)) return [];
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ target_user_id?: string }>) {
    const id = trimText(row.target_user_id);
    if (id) out.add(id);
  }
  return [...out];
}

/**
 * 순서 3 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md): `ownerIds` 중 `targetUserId` 를 친구로 저장한
 * 사람 집합 — `isFriendSavedByMe(owner, target)` 를 사람마다 부르던 것과 같은 조건(relation_type=friend 행 존재)을 1회로.
 * owner === target 은 제외(기존과 같음). 조회 오류는 빈 집합(기존 사람별 오류 → false 와 같음). 100명씩 나눠 묻는다.
 */
export async function listOwnersWhoSavedTargetAsFriend(
  targetUserId: string,
  ownerIds: readonly string[]
): Promise<Set<string>> {
  const target = trimText(targetUserId);
  const owners = [...new Set(ownerIds.map((id) => trimText(id)).filter((id) => id && id !== target))];
  const out = new Set<string>();
  if (!target || owners.length === 0) return out;
  const sb = getSupabaseOrNull();
  if (!sb) return out;
  for (let i = 0; i < owners.length; i += 100) {
    const chunk = owners.slice(i, i + 100);
    const { data, error } = await (sb as any)
      .from("user_social_relations")
      .select("owner_user_id")
      .eq("target_user_id", target)
      .eq("relation_type", "friend")
      .in("owner_user_id", chunk);
    if (error) continue;
    for (const row of (data ?? []) as Array<{ owner_user_id?: string }>) {
      const owner = trimText(row.owner_user_id);
      if (owner) out.add(owner);
    }
  }
  return out;
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

  /**
   * 1-D (docs/audit/messenger-room-check-fanout-fix-plan-2026-10-31.md): SSOT 1회만 읽는다.
   * legacy `user_relationships.blocked` 는 판정에 기여하지 않는다 — 운영 2026-11-01: legacy 차단 5행 전부 SSOT 활성 차단에
   * 존재(legacy 에만 있는 차단 0, 마지막 legacy 기록 10-13), 차단 쓰기는 SSOT 우선 (1-A 와 같은 근거).
   */
  const { data } = await (sb as any)
    .from("user_social_relations")
    .select("target_user_id, is_active, relation_type")
    .eq("owner_user_id", owner)
    .eq("relation_type", "blocked")
    .or(SOCIAL_BLOCK_ACTIVE_OR_LEGACY);

  for (const row of (data ?? []) as Array<{
    target_user_id?: string;
    is_active?: boolean | null;
    relation_type?: string;
  }>) {
    if (!isActiveSocialBlockRow(row)) continue;
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

export type ListHiddenUserRelationshipRowsResult =
  | { ok: true; rows: HiddenUserRelationshipRow[] }
  | { ok: false; error: string };

/** CM·마이페이지 숨김 SSOT — `user_relationships.relation_type=hidden`. F-11: DB 오류는 ok:false. */
export async function listHiddenUserRelationshipRowsResult(
  ownerUserId: string
): Promise<ListHiddenUserRelationshipRowsResult> {
  const owner = trimText(ownerUserId);
  if (!owner) return { ok: true, rows: [] };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "service_unavailable" };

  const { data, error } = await (sb as any)
    .from("user_relationships")
    .select("id, target_user_id, created_at")
    .eq("user_id", owner)
    .or("relation_type.eq.hidden,type.eq.hidden")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return { ok: true, rows: [] };
    return { ok: false, error: String(error.message ?? "hidden_list_failed") };
  }

  return {
    ok: true,
    rows: ((data ?? []) as Array<{ id?: string; target_user_id?: string; created_at?: string }>)
      .map((row) => ({
        id: trimText(row.id),
        targetUserId: trimText(row.target_user_id),
        createdAt: trimText(row.created_at),
      }))
      .filter((row) => row.id && row.targetUserId),
  };
}

/** CM·마이페이지 숨김 SSOT — `user_relationships.relation_type=hidden` */
export async function listHiddenUserRelationshipRows(
  ownerUserId: string
): Promise<HiddenUserRelationshipRow[]> {
  const result = await listHiddenUserRelationshipRowsResult(ownerUserId);
  if (!result.ok) return [];
  return result.rows;
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

  const [{ blockedByMe, blockedByPeer }, friendshipResolution, targetRestricted, rejectedByPeer] = await Promise.all([
    fetchBlockedPairsEitherWay(sb, viewer, target),
    getFriendshipPairState(sb, viewer, target),
    isProfileRestricted(sb, target),
    fetchFriendRequestRejectedByPeer(sb, viewer, target),
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

  if (rejectedByPeer) {
    return {
      canMessage: false,
      canCall: false,
      isFriend,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      isRejectedByPeer: true,
      reason: "rejected",
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

/**
 * 아이디로 회원 1명 찾기 (친구 요청·프로필 열기) — 설계안 v3 §3.3 의 「아이디 전체 일치」.
 * 판정은 DB `cm_search_members` 의 exact 와 같다: 탈퇴·서로 차단·「아이디로 나를 찾기」 끔 제외,
 * 바뀐 회원의 기본 아이디(dibay_id_initial)로는 찾지 않는다.
 */
export async function resolveUserByPublicId(
  publicIdRaw: string,
  viewerUserId?: string | null
): Promise<SocialRelationPublicProfile | null> {
  const keyword = normalizeProfileUserSearchKeyword(publicIdRaw);
  if (!keyword) return null;
  const sb = getSupabaseOrNull();
  if (!sb) return null;

  const viewer = trimText(viewerUserId) || PUBLIC_ID_LOOKUP_NO_VIEWER;
  const { data, error } = await (sb as any).rpc("cm_search_members", {
    p_viewer: viewer,
    p_query: keyword,
    p_limit: 5,
  });
  if (error) return null;
  const row = ((data ?? []) as Array<Record<string, unknown>>).find((r) => r.match_kind === "exact");
  if (!row) return null;

  const id = trimText(row.user_id);
  const publicId = trimText(row.dibay_id).toLowerCase();
  if (!id || !publicId) return null;
  const display = trimText(row.nickname) || trimText(row.display_name) || publicId || id;
  return {
    id,
    displayName: display,
    avatarUrl: trimText(row.avatar_url) || null,
    publicId,
  };
}

/** 보는 사람이 없을 때 — 어떤 회원과도 같지 않은 값(차단 판정에 걸리지 않음) */
const PUBLIC_ID_LOOKUP_NO_VIEWER = "00000000-0000-0000-0000-000000000000";

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
    if (convertError) return { ok: false, error: String(convertError.message ?? "friend_add_failed") };
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
  if (error) return { ok: false, error: String(error.message ?? "friend_add_failed") };

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

/**
 * 상호 친구 삭제 — 두 방향 `friend` 행을 한 문장으로 지운다(한쪽만 남는 비대칭 방지).
 * 상대 화면 실시간 반영은 호출 측이 요청 행 상태로 알린다(Realtime DELETE 는 filter 수신 불가).
 */
export async function removeFriendPairSaved(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const owner = trimText(ownerUserId);
  const target = trimText(targetUserId);
  if (!owner || !target || owner === target) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const { error } = await (sb as any)
    .from("user_social_relations")
    .delete()
    .eq("relation_type", "friend")
    .or(
      `and(owner_user_id.eq.${owner},target_user_id.eq.${target}),and(owner_user_id.eq.${target},target_user_id.eq.${owner})`
    );
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

  /** F-3 — 본인이 상대를 즐겨찾기한 행만 삭제. 상대→나 즐겨찾기는 보존. */
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

export async function unblockUserSocial(
  ownerUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string; wasActive?: boolean }> {
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
