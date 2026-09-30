import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateMemberAuthCachesOnLifecycleChange } from "@/lib/auth/invalidate-member-auth-caches";
import { normalizeAdminRole, isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import {
  ADMIN_PERMISSION_KEY_SET,
  type AdminPermissionKey,
} from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import type { AdminRole } from "@/lib/admin-menu-config";

export const MODERATION_ACTIONS = [
  "warn",
  "suspend",
  "ban",
  "restore",
  "soft_delete",
  "hard_delete",
  "purge",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return normalizeAdminRole(role) === "super_admin";
}

export function isAdminStaffRole(role: string | null | undefined): boolean {
  return isPrivilegedAdminRole(role);
}

export async function loadProfileRole(
  sb: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

/**
 * True only for missing TABLE — never for missing COLUMN / 42703 schema mismatch.
 * Column errors must surface as defects, not as "no permissions" / tier-default.
 */
export function isMissingAdminStaffPermissionsTable(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m.includes("admin_staff_permissions")) return false;
  // Column / undefined-column errors are NOT missing-table.
  if (m.includes("42703") || m.includes("column") || m.includes("permission_key")) {
    return false;
  }
  return (
    m.includes("could not find the table") ||
    m.includes("could not find table") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    (m.includes("schema cache") && m.includes("table"))
  );
}

/** Schema / column mismatch — must not be treated as valid empty permissions. */
export function isAdminStaffPermissionsSchemaError(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  if (isMissingAdminStaffPermissionsTable(message)) return false;
  if (m.includes("42703")) return true;
  if (m.includes("permission_key") && (m.includes("does not exist") || m.includes("could not find"))) {
    return true;
  }
  if (
    m.includes("admin_staff_permissions") &&
    m.includes("column") &&
    (m.includes("does not exist") || m.includes("could not find"))
  ) {
    return true;
  }
  return false;
}

/**
 * Validate + normalize AdminPermissionKey[] (JSON string array).
 * Dedupes; rejects non-array / non-string / unknown keys.
 */
export function normalizeAdminPermissionKeys(input: unknown): AdminPermissionKey[] {
  if (!Array.isArray(input)) {
    throw new Error("permissions_must_be_array");
  }
  const seen = new Set<string>();
  const out: AdminPermissionKey[] = [];
  for (const item of input) {
    if (typeof item !== "string") {
      throw new Error("permissions_invalid_item");
    }
    if (!ADMIN_PERMISSION_KEY_SET.has(item)) {
      throw new Error(`permissions_unknown_key:${item}`);
    }
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item as AdminPermissionKey);
  }
  return out;
}

/** Parse Live jsonb `permissions` payload — never cast without validation. */
export function parseAdminPermissionsPayload(raw: unknown): AdminPermissionKey[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("permissions_malformed_json");
    }
    return normalizeAdminPermissionKeys(parsed);
  }
  return normalizeAdminPermissionKeys(raw);
}

export async function loadStaffPermissionKeys(
  sb: SupabaseClient,
  userId: string
): Promise<AdminPermissionKey[]> {
  const { data, error } = await sb
    .from("admin_staff_permissions")
    .select("permissions")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingAdminStaffPermissionsTable(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }
  if (!data) return [];
  return parseAdminPermissionsPayload((data as { permissions?: unknown }).permissions);
}

/**
 * DB에 명시 권한이 없거나 VALID EMPTY ARRAY([])이면 admin_tier 기반 역할 기본 권한을 사용한다.
 * SCHEMA ERROR 는 여기로 내려오지 않는다 (throw).
 */
export async function loadEffectiveStaffPermissions(
  sb: SupabaseClient,
  userId: string,
  profileRole: string | null | undefined,
  adminTier: string | null | undefined
): Promise<AdminPermissionKey[]> {
  if (isSuperAdminRole(profileRole)) {
    return defaultPermissionsForUiRole("master");
  }
  if (!isAdminStaffRole(profileRole)) return [];
  const explicit = await loadStaffPermissionKeys(sb, userId);
  if (explicit.length > 0) return explicit;
  return defaultPermissionsForUiRole(adminTierToUiRole(adminTier ?? null, profileRole ?? null));
}

/** 스태프 목록용 — 권한을 user_id별로 한 번에 로드 */
export async function loadStaffPermissionsMap(
  sb: SupabaseClient,
  userIds: string[]
): Promise<Map<string, AdminPermissionKey[]>> {
  const out = new Map<string, AdminPermissionKey[]>();
  if (userIds.length === 0) return out;
  const { data, error } = await sb
    .from("admin_staff_permissions")
    .select("user_id, permissions")
    .in("user_id", userIds);
  if (error) {
    if (isMissingAdminStaffPermissionsTable(error.message)) {
      return out;
    }
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    const keys = parseAdminPermissionsPayload((row as { permissions?: unknown }).permissions);
    out.set(uid, keys);
  }
  return out;
}

/** 회원 목록용 — 경고 이벤트가 있는 user_id 집합 (정지·삭제 상태는 제외) */
export async function loadWarnedUserIdSet(
  sb: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  const warned = new Set<string>();
  if (userIds.length === 0) return warned;
  const { data, error } = await sb
    .from("user_moderation_events")
    .select("user_id")
    .in("user_id", userIds)
    .eq("action", "warn");
  if (error) {
    if (error.message?.includes("user_moderation_events") && error.message.includes("does not exist")) {
      return warned;
    }
    return warned;
  }
  for (const row of data ?? []) {
    warned.add(String((row as { user_id: string }).user_id));
  }
  return warned;
}

export function permissionKeyAllowed(
  permissions: AdminPermissionKey[],
  key: AdminPermissionKey
): boolean {
  if (permissions.includes(key)) return true;
  if (key === "users_edit_membership" && permissions.includes("users")) return true;
  return false;
}

export async function actorHasPermission(
  sb: SupabaseClient,
  actorId: string,
  actorRole: string | null | undefined,
  key: AdminPermissionKey,
  adminTier?: string | null
): Promise<boolean> {
  if (isSuperAdminRole(actorRole)) return true;
  if (!isAdminStaffRole(actorRole)) return false;
  const perms = await loadEffectiveStaffPermissions(sb, actorId, actorRole, adminTier ?? null);
  return permissionKeyAllowed(perms, key);
}

export function adminTierToUiRole(tier: string | null | undefined, profileRole: string | null): AdminRole {
  if (isSuperAdminRole(profileRole)) return "master";
  const t = String(tier ?? "").trim().toLowerCase();
  if (t === "manager") return "manager";
  return "operator";
}

export function uiRoleToAdminTier(role: AdminRole): string | null {
  if (role === "master") return null;
  if (role === "manager") return "manager";
  return "operator";
}

export function defaultPermissionsForUiRole(role: AdminRole): AdminPermissionKey[] {
  return [...DEFAULT_PERMISSIONS_BY_ROLE[role]];
}

export async function invalidateAllUserSessions(
  sb: SupabaseClient,
  userId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("profiles").update({ active_session_id: null }).eq("id", userId);
  const { error } = await sb
    .from("user_sessions")
    .update({
      active: false,
      invalidated_at: now,
      invalidation_reason: reason.slice(0, 200),
      last_seen_at: now,
    })
    .eq("user_id", userId)
    .eq("active", true);
  if (error && !error.message?.includes("user_sessions")) {
    console.error("[invalidateAllUserSessions]", error.message);
  }
  // P0-R2: lifecycle + all identity/session warm caches (not light snap alone).
  invalidateMemberAuthCachesOnLifecycleChange(userId);
}

async function insertModerationEventRow(
  sb: SupabaseClient,
  row: {
    userId: string;
    actorId: string;
    action: ModerationAction;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string;
  }
): Promise<{ id: string | null; error: { message: string } | null }> {
  const { data, error } = await sb
    .from("user_moderation_events")
    .insert({
      user_id: row.userId,
      actor_id: row.actorId,
      action: row.action,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      reason: row.reason.slice(0, 2000),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    return { id: null, error: { message: error.message } };
  }
  return { id: (data as { id?: string } | null)?.id ?? null, error: null };
}

export async function insertModerationEvent(
  sb: SupabaseClient,
  row: {
    userId: string;
    actorId: string;
    action: ModerationAction;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string;
  }
): Promise<string | null> {
  const first = await insertModerationEventRow(sb, row);
  if (!first.error) return first.id;

  const message = first.error.message;
  if (message.includes("user_moderation_events") && message.includes("does not exist")) {
    return null;
  }

  /** 마이그레이션 `20260614210000` 적용 전 — purge → hard_delete 로 기록 */
  if (
    row.action === "purge" &&
    (message.includes("user_moderation_events_action_check") ||
      message.includes("violates check constraint"))
  ) {
    const fallback = await insertModerationEventRow(sb, { ...row, action: "hard_delete" });
    if (!fallback.error) return fallback.id;
    if (
      fallback.error.message.includes("user_moderation_events") &&
      fallback.error.message.includes("does not exist")
    ) {
      return null;
    }
    throw new Error(fallback.error.message);
  }

  throw new Error(message);
}

export async function userHasRecentWarn(
  sb: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("user_moderation_events")
    .select("id")
    .eq("user_id", userId)
    .eq("action", "warn")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return false;
  if (!data?.length) return false;
  return true;
}

/**
 * Live canonical WRITE: one user_id → one permissions jsonb string array.
 * Empty [] is a valid persisted payload (read path still applies tier-default).
 */
export async function replaceStaffPermissions(
  sb: SupabaseClient,
  userId: string,
  permissions: AdminPermissionKey[],
  grantedBy: string
): Promise<void> {
  const normalized = normalizeAdminPermissionKeys(permissions);
  const now = new Date().toISOString();
  const { error } = await sb.from("admin_staff_permissions").upsert(
    {
      user_id: userId,
      permissions: normalized,
      updated_at: now,
      updated_by: grantedBy,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    if (isMissingAdminStaffPermissionsTable(error.message)) {
      throw new Error(`admin_staff_permissions_missing:${error.message}`);
    }
    throw new Error(error.message);
  }
}
