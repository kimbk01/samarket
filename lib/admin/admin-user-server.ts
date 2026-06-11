import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAdminRole, isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import type { AdminRole } from "@/lib/admin-menu-config";

export const MODERATION_ACTIONS = [
  "warn",
  "suspend",
  "ban",
  "restore",
  "soft_delete",
  "hard_delete",
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

export async function loadStaffPermissionKeys(
  sb: SupabaseClient,
  userId: string
): Promise<AdminPermissionKey[]> {
  const { data, error } = await sb
    .from("admin_staff_permissions")
    .select("permission_key")
    .eq("user_id", userId);
  if (error) {
    if (error.message?.includes("admin_staff_permissions") && error.message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => String((r as { permission_key: string }).permission_key)) as AdminPermissionKey[];
}

/** DB에 행이 없으면 admin_tier 기반 역할 기본 권한을 사용한다. */
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
    .select("user_id, permission_key")
    .in("user_id", userIds);
  if (error) {
    if (error.message?.includes("admin_staff_permissions") && error.message.includes("does not exist")) {
      return out;
    }
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const uid = String((row as { user_id: string }).user_id);
    const key = String((row as { permission_key: string }).permission_key) as AdminPermissionKey;
    const list = out.get(uid) ?? [];
    list.push(key);
    out.set(uid, list);
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
    if (error.message?.includes("user_moderation_events") && error.message.includes("does not exist")) {
      return null;
    }
    throw new Error(error.message);
  }
  return (data as { id?: string } | null)?.id ?? null;
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

export async function replaceStaffPermissions(
  sb: SupabaseClient,
  userId: string,
  permissions: AdminPermissionKey[],
  grantedBy: string
): Promise<void> {
  await sb.from("admin_staff_permissions").delete().eq("user_id", userId);
  if (permissions.length === 0) return;
  await sb.from("admin_staff_permissions").insert(
    permissions.map((permission_key) => ({
      user_id: userId,
      permission_key,
      granted_by: grantedBy,
    }))
  );
}
