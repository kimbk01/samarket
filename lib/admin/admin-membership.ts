/**
 * Admin Membership SSOT helpers — PHASE E.1
 * Contract: docs/dibay-member-auth-phase-d-structure-design.md §1
 *
 * Application authority (readers): active admin_memberships ONLY.
 * Admin privilege writers: membership mutation ONLY — no profiles.role / is_admin mirror.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";
import type { AdminRole } from "@/lib/admin-menu-config";
import { adminTierToUiRole, isSuperAdminRole } from "@/lib/admin/admin-user-server";

export type AdminMembershipRole = "admin" | "super_admin";
export type AdminMembershipStatus = "active" | "suspended" | "revoked";

export type AdminMembershipRow = {
  id: string;
  user_id: string;
  role: AdminMembershipRole;
  status: AdminMembershipStatus;
  admin_tier: string | null;
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  bootstrap_seed: boolean;
};

function isMissingMembershipTable(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("admin_memberships") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function loadActiveAdminMembership(
  sb: SupabaseClient,
  userId: string
): Promise<AdminMembershipRow | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  const { data, error } = await sb
    .from("admin_memberships")
    .select(
      "id, user_id, role, status, admin_tier, granted_at, granted_by, revoked_at, revoked_by, revoke_reason, bootstrap_seed"
    )
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    if (isMissingMembershipTable(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as AdminMembershipRow | null) ?? null;
}

/**
 * 판정 전용 캐시 (2026-11-02 Owner 승인 · `docs/auth-hard-lock.md` Amendment 2026-11-02).
 * 관리자 API·회원 화면이 요청마다 같은 행을 읽던 것을 서버 프로세스 메모리에서 재사용한다.
 * 있음 15초 · 없음 60초 · 같은 사용자 동시 조회 1회 · 오류는 캐시하지 않는다.
 * 다른 인스턴스에는 권한 회수가 최대 15초 늦게 반영된다 (Owner 허용). 변경·대상 확인 경로는
 * `loadActiveAdminMembership` 를 직접 써서 매번 DB 를 읽는다.
 */
export const ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS = 15_000;
export const ADMIN_MEMBERSHIP_JUDGMENT_NEGATIVE_TTL_MS = 60_000;
const ADMIN_MEMBERSHIP_JUDGMENT_MAX_ENTRIES = 2_000;

type JudgmentEntry = { row: AdminMembershipRow | null; expiresAt: number };
type JudgmentState = {
  cache: Map<string, JudgmentEntry>;
  inflight: Map<string, { generation: number; promise: Promise<AdminMembershipRow | null> }>;
  generation: number;
};
/** 전역 키 — 시험 설정(`tests/vitest-setup.node.ts`)이 모듈을 가져오지 않고 비울 수 있게 한다. */
const JUDGMENT_STATE_KEY = "__dibayAdminMembershipJudgmentCache";
function judgmentState(): JudgmentState {
  const g = globalThis as unknown as Record<string, JudgmentState | undefined>;
  let st = g[JUDGMENT_STATE_KEY];
  if (!st) {
    st = { cache: new Map(), inflight: new Map(), generation: 0 };
    g[JUDGMENT_STATE_KEY] = st;
  }
  return st;
}

async function loadActiveAdminMembershipForJudgment(
  sb: SupabaseClient,
  userId: string
): Promise<AdminMembershipRow | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  const st = judgmentState();
  const hit = st.cache.get(uid);
  if (hit && hit.expiresAt > Date.now()) return hit.row;
  if (hit) st.cache.delete(uid);

  const flying = st.inflight.get(uid);
  if (flying && flying.generation === st.generation) return flying.promise;

  const generation = st.generation;
  const promise = loadActiveAdminMembership(sb, uid)
    .then((row) => {
      // 조회 중에 무효화되었으면 옛 결과를 저장하지 않는다.
      const cur = judgmentState();
      if (generation === cur.generation) {
        if (cur.cache.size >= ADMIN_MEMBERSHIP_JUDGMENT_MAX_ENTRIES) {
          const oldest = cur.cache.keys().next().value;
          if (oldest !== undefined) cur.cache.delete(oldest);
        }
        cur.cache.set(uid, {
          row,
          expiresAt:
            Date.now() +
            (row ? ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS : ADMIN_MEMBERSHIP_JUDGMENT_NEGATIVE_TTL_MS),
        });
      }
      return row;
    })
    .finally(() => {
      const cur = judgmentState();
      if (cur.inflight.get(uid)?.promise === promise) cur.inflight.delete(uid);
    });
  st.inflight.set(uid, { generation, promise });
  return promise;
}

/** 판정 캐시 비우기 — `userId` 없으면 전체. 권한 부여·회수 뒤와 시험 사이에 호출한다. */
export function invalidateAdminMembershipJudgmentCache(userId?: string | null): void {
  const st = judgmentState();
  st.generation += 1;
  const uid = String(userId ?? "").trim();
  if (uid) {
    st.cache.delete(uid);
    st.inflight.delete(uid);
  } else {
    st.cache.clear();
    st.inflight.clear();
  }
}

/**
 * 활성 membership 이 관리자 권한(admin·super_admin)이면 그 행, 아니면 null.
 * 판정식은 `hasActiveAdminMembershipOrLegacyRole` 과 같다 — 가드가 판정과 행(role·admin_tier)을 1회 조회로 함께 얻을 때 쓴다.
 * 조회 오류는 throw (호출자가 deny 로 처리).
 */
export async function loadPrivilegedAdminMembership(
  sb: SupabaseClient,
  userId: string
): Promise<AdminMembershipRow | null> {
  const membership = await loadActiveAdminMembershipForJudgment(sb, userId);
  if (!membership) return null;
  return isPrivilegedAdminRole(normalizeAdminRole(membership.role)) ? membership : null;
}

/**
 * Application effective admin role = active membership role only.
 * `profileRole` is ignored (kept for call-site compatibility; not an authority fallback).
 */
export async function resolveEffectiveAdminRole(
  sb: SupabaseClient,
  userId: string,
  profileRole?: string | null
): Promise<string | null> {
  void profileRole;
  const membership = await loadActiveAdminMembershipForJudgment(sb, userId).catch(() => null);
  if (!membership) return null;
  return normalizeAdminRole(membership.role);
}

/**
 * Application Admin allow/deny — membership-only.
 * Name retained to avoid a wide rename; legacy profiles.role is not consulted.
 */
export async function hasActiveAdminMembershipOrLegacyRole(
  sb: SupabaseClient,
  userId: string,
  profileRole?: string | null
): Promise<boolean> {
  void profileRole;
  const effective = await resolveEffectiveAdminRole(sb, userId);
  return isPrivilegedAdminRole(effective);
}

/** Explicit alias — same membership-only formula. */
export const hasActiveAdminMembership = hasActiveAdminMembershipOrLegacyRole;

export async function countActiveSuperAdmins(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("admin_memberships")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("role", "super_admin");
  if (error) {
    if (isMissingMembershipTable(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export type UpsertAdminMembershipInput = {
  userId: string;
  role: AdminMembershipRole;
  adminTier?: string | null;
  grantedBy: string | null;
  bootstrapSeed?: boolean;
};

/**
 * Ensure exactly one active membership for user.
 * Does NOT write profiles.role / is_admin / member_type / admin_tier (dual-write cutover).
 */
export async function upsertActiveAdminMembership(
  sb: SupabaseClient,
  input: UpsertAdminMembershipInput
): Promise<{ ok: true; membershipId: string } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  if (!userId) return { ok: false, error: "user_id_required" };
  const now = new Date().toISOString();
  const tier =
    input.role === "super_admin"
      ? null
      : input.adminTier === "manager"
        ? "manager"
        : "operator";

  const existing = await loadActiveAdminMembership(sb, userId).catch(() => null);

  if (existing) {
    const { error: upErr } = await sb
      .from("admin_memberships")
      .update({
        role: input.role,
        admin_tier: input.role === "super_admin" ? null : tier,
        updated_at: now,
        bootstrap_seed: input.bootstrapSeed === true ? true : existing.bootstrap_seed,
      })
      .eq("id", existing.id);
    if (upErr) {
      if (isMissingMembershipTable(upErr.message)) {
        return { ok: false, error: "admin_memberships_missing" };
      }
      return { ok: false, error: upErr.message };
    }
  } else {
    const { data: inserted, error: insErr } = await sb
      .from("admin_memberships")
      .insert({
        user_id: userId,
        role: input.role,
        status: "active",
        admin_tier: input.role === "super_admin" ? null : tier,
        granted_at: now,
        granted_by: input.grantedBy,
        bootstrap_seed: input.bootstrapSeed === true,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();
    if (insErr) {
      if (isMissingMembershipTable(insErr.message)) {
        return { ok: false, error: "admin_memberships_missing" };
      }
      return { ok: false, error: insErr.message };
    }
    if (!inserted?.id) {
      return { ok: false, error: "membership_insert_failed" };
    }
  }

  invalidateAdminMembershipJudgmentCache(userId);
  const again = await loadActiveAdminMembership(sb, userId).catch(() => null);
  if (!again?.id) return { ok: false, error: "membership_missing_after_upsert" };
  return { ok: true, membershipId: again.id };
}

export type RevokeAdminMembershipInput = {
  userId: string;
  revokedBy: string | null;
  reason?: string;
};

/**
 * Revoke active membership. Refuses if target is the last active SUPER_ADMIN.
 * Does NOT reset profiles.role / is_admin (stale mirror may remain; not authority).
 */
export async function revokeActiveAdminMembership(
  sb: SupabaseClient,
  input: RevokeAdminMembershipInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  if (!userId) return { ok: false, error: "user_id_required" };

  const membership = await loadActiveAdminMembership(sb, userId).catch(() => null);
  if (!membership) return { ok: false, error: "not_admin" };

  const effectiveRole = normalizeAdminRole(membership.role);
  if (isSuperAdminRole(effectiveRole)) {
    const superCount = await countActiveSuperAdmins(sb);
    if (superCount <= 1) {
      return { ok: false, error: "last_super_admin" };
    }
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("admin_memberships")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by: input.revokedBy,
      revoke_reason: String(input.reason ?? "revoked").slice(0, 500),
      updated_at: now,
    })
    .eq("id", membership.id);
  if (error) {
    if (isMissingMembershipTable(error.message)) {
      return { ok: false, error: "admin_memberships_missing" };
    }
    return { ok: false, error: error.message };
  }
  invalidateAdminMembershipJudgmentCache(userId);

  await sb.from("admin_staff_permissions").delete().eq("user_id", userId);
  // Follow-up side effect: a failure here never un-revokes. Admin notification delivery
  // re-checks authority, so a lingering assignment cannot reach a revoked admin anyway.
  try {
    await releaseSupportAssignmentsOnRevoke(sb, { userId, revokedBy: input.revokedBy });
  } catch (e) {
    console.error("[admin-membership] support_release_threw", { userId, error: (e as Error).message });
  }
  return { ok: true };
}

/**
 * R13: a revoked admin must not keep receiving customer replies (support_customer_replied
 * targets `assigned_admin_id`). Open cases return to the unassigned queue (support_actionable
 * still counts them) with an audit event per case. Closed cases keep their history untouched.
 */
export async function releaseSupportAssignmentsOnRevoke(
  sb: SupabaseClient,
  input: { userId: string; revokedBy: string | null }
): Promise<{ released: number; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_cases")
    .update({ assigned_admin_id: null, updated_at: now })
    .eq("assigned_admin_id", input.userId)
    .not("status", "in", "(RESOLVED,ARCHIVED)")
    .select("id");
  if (error) {
    if (/support_cases/i.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
      return { released: 0 };
    }
    console.error("[admin-membership] support_release_failed", { userId: input.userId, error: error.message });
    return { released: 0, error: error.message };
  }
  const ids = (data ?? []).map((r) => String((r as { id?: unknown }).id ?? "")).filter(Boolean);
  if (ids.length > 0) {
    const { error: evErr } = await sb.from("support_case_events").insert(
      ids.map((caseId) => ({
        case_id: caseId,
        event_type: "assignee_released_admin_revoked",
        actor_user_id: input.revokedBy,
        payload: { previous_assignee: input.userId },
      }))
    );
    if (evErr) {
      console.error("[admin-membership] support_release_event_failed", { error: evErr.message });
    }
  }
  return { released: ids.length };
}

export function membershipToUiRole(membership: AdminMembershipRow | null, profileRole: string | null): AdminRole {
  if (membership) {
    return adminTierToUiRole(membership.admin_tier, membership.role);
  }
  return adminTierToUiRole(null, profileRole);
}
