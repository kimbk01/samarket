/**
 * Admin Membership SSOT helpers — PHASE E.1
 * Contract: docs/dibay-member-auth-phase-d-structure-design.md §1
 *
 * Dual-read window: active membership OR transitional profiles.role.
 * Writers must upsert membership when granting/revoking admin (and keep profiles.role in sync until cutover).
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

/** Dual-read: membership first, else transitional profiles.role */
export async function resolveEffectiveAdminRole(
  sb: SupabaseClient,
  userId: string,
  profileRole?: string | null
): Promise<string | null> {
  const membership = await loadActiveAdminMembership(sb, userId).catch(() => null);
  if (membership) {
    return normalizeAdminRole(membership.role);
  }
  if (profileRole !== undefined) {
    return isPrivilegedAdminRole(profileRole) ? normalizeAdminRole(profileRole) : null;
  }
  const { data } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data as { role?: string } | null)?.role ?? null;
  return isPrivilegedAdminRole(role) ? normalizeAdminRole(role) : null;
}

export async function hasActiveAdminMembershipOrLegacyRole(
  sb: SupabaseClient,
  userId: string,
  profileRole?: string | null
): Promise<boolean> {
  const effective = await resolveEffectiveAdminRole(sb, userId, profileRole);
  return isPrivilegedAdminRole(effective);
}

export async function countActiveSuperAdmins(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("admin_memberships")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("role", "super_admin");
  if (error) {
    if (isMissingMembershipTable(error.message)) {
      const { count: legacyCount } = await sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["super_admin", "master"]);
      return legacyCount ?? 0;
    }
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
 * Ensure exactly one active membership for user (revoke prior active rows of other ids).
 * Also keeps profiles.role / admin_tier / is_admin in sync (transitional dual-write).
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
        // Table not migrated yet — profiles-only transitional path
      } else {
        return { ok: false, error: upErr.message };
      }
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
      if (!isMissingMembershipTable(insErr.message)) {
        return { ok: false, error: insErr.message };
      }
    } else if (!inserted?.id) {
      /* profiles sync below still runs */
    }
  }

  const profileRole = input.role === "super_admin" ? "super_admin" : "admin";
  const { error: profileErr } = await sb
    .from("profiles")
    .update({
      role: profileRole,
      is_admin: true,
      member_type: "admin",
      admin_tier: input.role === "super_admin" ? null : tier,
    })
    .eq("id", userId);
  if (profileErr) return { ok: false, error: profileErr.message };

  const again = await loadActiveAdminMembership(sb, userId).catch(() => null);
  return { ok: true, membershipId: again?.id ?? userId };
}

export type RevokeAdminMembershipInput = {
  userId: string;
  revokedBy: string | null;
  reason?: string;
};

/**
 * Revoke active membership. Refuses if target is the last active SUPER_ADMIN.
 * Dual-write: sets profiles.role back to user.
 */
export async function revokeActiveAdminMembership(
  sb: SupabaseClient,
  input: RevokeAdminMembershipInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  if (!userId) return { ok: false, error: "user_id_required" };

  const membership = await loadActiveAdminMembership(sb, userId).catch(() => null);
  const profileRoleFallback = membership
    ? null
    : ((await sb.from("profiles").select("role").eq("id", userId).maybeSingle()).data as { role?: string } | null)
        ?.role ?? null;

  const effectiveRole = membership?.role ?? (isPrivilegedAdminRole(profileRoleFallback) ? normalizeAdminRole(profileRoleFallback) : null);
  if (!effectiveRole) return { ok: false, error: "not_admin" };

  if (isSuperAdminRole(effectiveRole)) {
    const n = await countActiveSuperAdmins(sb);
    // If only legacy profiles and no membership table rows, count via profiles
    let superCount = n;
    if (superCount === 0 && isSuperAdminRole(profileRoleFallback)) {
      const { count } = await sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["super_admin", "master"]);
      superCount = count ?? 0;
    }
    if (superCount <= 1) {
      return { ok: false, error: "last_super_admin" };
    }
  }

  const now = new Date().toISOString();
  if (membership) {
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
    if (error && !isMissingMembershipTable(error.message)) {
      return { ok: false, error: error.message };
    }
  }

  await sb.from("admin_staff_permissions").delete().eq("user_id", userId);
  const { error: profileErr } = await sb
    .from("profiles")
    .update({
      role: "user",
      is_admin: false,
      member_type: "normal",
      admin_tier: null,
    })
    .eq("id", userId);
  if (profileErr) return { ok: false, error: profileErr.message };
  return { ok: true };
}

export function membershipToUiRole(membership: AdminMembershipRow | null, profileRole: string | null): AdminRole {
  if (membership) {
    return adminTierToUiRole(membership.admin_tier, membership.role);
  }
  return adminTierToUiRole(null, profileRole);
}
