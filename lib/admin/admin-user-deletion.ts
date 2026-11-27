import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModerationAction } from "@/lib/admin/admin-user-server";

/** 어드민 회원 삭제 모드 — 제품 용어 */
export type AdminUserDeleteMode = "withdraw" | "purge";

const MODE_ALIASES: Record<string, AdminUserDeleteMode> = {
  withdraw: "withdraw",
  purge: "purge",
  soft: "withdraw",
  hard: "purge",
};

export function normalizeAdminUserDeleteMode(raw: string | null | undefined): AdminUserDeleteMode | null {
  const key = String(raw ?? "").trim().toLowerCase();
  return MODE_ALIASES[key] ?? null;
}

export function moderationActionForDeleteMode(mode: AdminUserDeleteMode): ModerationAction {
  return mode === "purge" ? "purge" : "soft_delete";
}

export const WITHDRAWN_MEMBER_NICKNAME = "탈퇴회원";

/** 일반 삭제(탈퇴) — profiles 유지·개인정보 익명화. auth.users 는 유지(재가입은 purge 필요). */
export function buildWithdrawProfilePatch(nowIso: string): Record<string, unknown> {
  return {
    status: "deleted",
    deleted_at: nowIso,
    deletion_requested_at: nowIso,
    nickname: WITHDRAWN_MEMBER_NICKNAME,
    display_name: WITHDRAWN_MEMBER_NICKNAME,
    email: null,
    auth_login_email: null,
    phone: null,
    phone_number: null,
    phone_country_code: null,
    phone_verified: false,
    phone_verified_at: null,
    phone_verification_status: "unverified",
    avatar_url: null,
    active_session_id: null,
    username: null,
    username_confirmed: false,
    dibay_id: null,
    dibay_id_locked: false,
    onboarding_status: "pending",
    onboarding_completed_at: null,
    terms_accepted_at: null,
    terms_version: null,
    privacy_accepted_at: null,
    privacy_version: null,
    member_status: null,
    provider_user_id: null,
    updated_at: nowIso,
  };
}

export type AuthUserPurgeBlockerResult = {
  ok: boolean;
  blockers: string[];
};

export async function fetchAuthUserPurgeBlockers(
  sb: SupabaseClient,
  userId: string
): Promise<AuthUserPurgeBlockerResult> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, blockers: ["invalid_user_id"] };

  const { data, error } = await sb.rpc("admin_can_purge_auth_user", { p_user_id: uid });
  if (error) {
    if (error.message?.includes("admin_can_purge_auth_user") && error.message.includes("does not exist")) {
      return fetchAuthUserPurgeBlockersFallback(sb, uid);
    }
    return { ok: false, blockers: [error.message || "purge_blocker_check_failed"] };
  }

  const payload = data as { ok?: boolean; blockers?: unknown } | null;
  const blockers = Array.isArray(payload?.blockers)
    ? payload!.blockers.map((b) => String(b)).filter(Boolean)
    : [];
  return { ok: payload?.ok === true, blockers };
}

async function fetchAuthUserPurgeBlockersFallback(
  sb: SupabaseClient,
  userId: string
): Promise<AuthUserPurgeBlockerResult> {
  const blockers: string[] = [];
  const checks: Array<{ table: string; column: string; label: string }> = [
    { table: "group_rooms", column: "created_by", label: "group_rooms.created_by" },
    { table: "group_messages", column: "sender_id", label: "group_messages.sender_id" },
    { table: "group_audit_log", column: "actor_id", label: "group_audit_log.actor_id" },
    { table: "stores", column: "owner_user_id", label: "stores.owner_user_id" },
  ];
  for (const check of checks) {
    const { count, error } = await sb
      .from(check.table)
      .select("id", { count: "exact", head: true })
      .eq(check.column, userId);
    if (error) continue;
    if ((count ?? 0) > 0) blockers.push(check.label);
  }
  return { ok: blockers.length === 0, blockers };
}

/** 시스템 계정(커뮤니티 가져오기 글 작성자) — DB 가 삭제를 막는다(ON DELETE RESTRICT) */
export const PURGE_BLOCKER_SYSTEM_ACCOUNT = "community_import_principal";

/**
 * 영구 삭제 직전 준비 — 기기 행이 지워질 때 캠페인 발송 기록이 고유키에서 겹치지 않게 겹칠 행만 지운다.
 * 운영 DB 에 함수가 아직 없으면(마이그레이션 적용 전) 건너뛴다 — 지금과 같은 동작.
 * 설계 docs/audit/admin-user-purge-failures-2026-11-27/design.md D2·C1
 */
export async function prepareAuthUserPurge(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; deliveriesDeleted: number | null } | { ok: false; error: string }> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, error: "invalid_user_id" };
  const { data, error } = await sb.rpc("admin_prepare_auth_user_purge", { p_user_id: uid });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("admin_prepare_auth_user_purge") && (message.includes("does not exist") || message.includes("Could not find"))) {
      return { ok: true, deliveriesDeleted: null };
    }
    return { ok: false, error: message || "purge_prepare_failed" };
  }
  const payload = data as { ok?: boolean; deliveries_deleted?: unknown; error?: unknown } | null;
  if (payload?.ok !== true) return { ok: false, error: String(payload?.error ?? "purge_prepare_failed") };
  const n = Number(payload.deliveries_deleted);
  return { ok: true, deliveriesDeleted: Number.isFinite(n) ? n : 0 };
}

function isAuthUserNotFoundError(message: string): boolean {
  const normalized = String(message ?? "").trim().toLowerCase();
  return (
    normalized.includes("user not found") ||
    normalized.includes("not found") ||
    normalized.includes("users_not_found")
  );
}

export async function purgeAuthUserById(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, error: "invalid_user_id" };

  const { error } = await sb.auth.admin.deleteUser(uid);
  if (!error) return { ok: true };

  const message = error.message || "auth_user_delete_failed";
  if (!isAuthUserNotFoundError(message)) {
    return { ok: false, error: message };
  }

  /** auth.users 는 없고 profiles 만 남은 orphan — profiles 행 제거로 purge 완료 처리 */
  const { error: profileDeleteError } = await sb.from("profiles").delete().eq("id", uid);
  if (profileDeleteError) {
    return { ok: false, error: profileDeleteError.message || message };
  }
  return { ok: true };
}

/** 레거시 삭제 API(100년 ban)로 막힌 auth.users — 탈퇴 처리 시 ban 해제 */
export async function clearLegacyAuthBanForWithdraw(
  sb: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    await sb.auth.admin.updateUserById(userId, { ban_duration: "none" } as never);
  } catch {
    /* best-effort */
  }
}
