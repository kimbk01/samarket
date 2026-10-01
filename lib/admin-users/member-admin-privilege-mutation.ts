/**
 * R6 privilege-only mutation writers.
 * Promote/revoke touch `admin_memberships` (+ staff permissions) only —
 * never account soft-delete / Store ownership / member classification.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasActiveAdminMembershipOrLegacyRole,
  loadActiveAdminMembership,
  revokeActiveAdminMembership,
  upsertActiveAdminMembership,
} from "@/lib/admin/admin-membership";
import {
  defaultPermissionsForUiRole,
  isSuperAdminRole,
  replaceStaffPermissions,
  uiRoleToAdminTier,
} from "@/lib/admin/admin-user-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import type { MemberPrivilegeMutationOp } from "@/lib/admin-users/member-admin-privilege-ssot";
import { MEMBER_PRIVILEGE_ONE_ACTIVE_PER_USER_INDEX } from "@/lib/admin-users/member-admin-privilege-ssot";

export type PrivilegeMutationActor = { userId: string };

export type PrivilegeMutationResult =
  | {
      ok: true;
      op: MemberPrivilegeMutationOp;
      before: { privilege: "member" | "admin" | "super_admin" };
      after: { privilege: "member" | "admin" };
    }
  | { ok: false; error: string; status: number };

function isUniqueActiveMembershipViolation(message: string): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("23505") ||
    m.includes("duplicate") ||
    m.includes(MEMBER_PRIVILEGE_ONE_ACTIVE_PER_USER_INDEX.toLowerCase())
  );
}

function presentationFromRole(role: string | null | undefined): "admin" | "super_admin" {
  return isSuperAdminRole(role) ? "super_admin" : "admin";
}

export async function executeMemberPrivilegePromote(
  sb: SupabaseClient,
  input: { actor: PrivilegeMutationActor; targetUserId: string },
): Promise<PrivilegeMutationResult> {
  const targetUserId = String(input.targetUserId ?? "").trim();
  if (!targetUserId) return { ok: false, error: "invalid_id", status: 400 };
  if (targetUserId === input.actor.userId) {
    return { ok: false, error: "self_mutation_forbidden", status: 403 };
  }

  const { data: profile } = await sb.from("profiles").select("id").eq("id", targetUserId).maybeSingle();
  if (!profile) return { ok: false, error: "not_found", status: 404 };

  const existing = await loadActiveAdminMembership(sb, targetUserId).catch(() => null);
  if (existing) {
    if (isSuperAdminRole(existing.role)) {
      return { ok: false, error: "cannot_modify_super_admin", status: 403 };
    }
    return { ok: false, error: "already_admin", status: 409 };
  }

  const alreadyAdmin = await hasActiveAdminMembershipOrLegacyRole(sb, targetUserId).catch(() => false);
  if (alreadyAdmin) {
    return { ok: false, error: "already_admin", status: 409 };
  }

  const permissions = defaultPermissionsForUiRole("operator");
  const upserted = await upsertActiveAdminMembership(sb, {
    userId: targetUserId,
    role: "admin",
    adminTier: uiRoleToAdminTier("operator"),
    grantedBy: input.actor.userId,
  });
  if (!upserted.ok) {
    if (isUniqueActiveMembershipViolation(upserted.error)) {
      return { ok: false, error: "already_admin", status: 409 };
    }
    return { ok: false, error: upserted.error, status: 400 };
  }

  await replaceStaffPermissions(sb, targetUserId, permissions, input.actor.userId);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.actor.userId,
    target_type: "staff",
    target_id: targetUserId,
    action: "promote_to_admin",
    before_json: { privilege: "member" },
    after_json: {
      privilege: "admin",
      role: "operator",
      permissions,
      membership: true,
      axis: "admin_privilege",
    },
  });

  return {
    ok: true,
    op: "promote",
    before: { privilege: "member" },
    after: { privilege: "admin" },
  };
}

export async function executeMemberPrivilegeRevoke(
  sb: SupabaseClient,
  input: { actor: PrivilegeMutationActor; targetUserId: string; reason?: string },
): Promise<PrivilegeMutationResult> {
  const targetUserId = String(input.targetUserId ?? "").trim();
  if (!targetUserId) return { ok: false, error: "invalid_id", status: 400 };
  if (targetUserId === input.actor.userId) {
    return { ok: false, error: "self_mutation_forbidden", status: 403 };
  }

  const { data: profile } = await sb.from("profiles").select("id").eq("id", targetUserId).maybeSingle();
  if (!profile) return { ok: false, error: "not_found", status: 404 };

  const existing = await loadActiveAdminMembership(sb, targetUserId).catch(() => null);
  if (!existing) {
    return { ok: false, error: "not_admin", status: 409 };
  }

  if (isSuperAdminRole(existing.role)) {
    return { ok: false, error: "cannot_modify_super_admin", status: 403 };
  }

  const beforePrivilege = presentationFromRole(existing.role);
  const revoked = await revokeActiveAdminMembership(sb, {
    userId: targetUserId,
    revokedBy: input.actor.userId,
    reason: input.reason ?? "privilege_revoke",
  });
  if (!revoked.ok) {
    if (revoked.error === "not_admin") {
      return { ok: false, error: "not_admin", status: 409 };
    }
    if (revoked.error === "last_super_admin") {
      return { ok: false, error: "last_super_admin", status: 403 };
    }
    return { ok: false, error: revoked.error, status: 400 };
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.actor.userId,
    target_type: "staff",
    target_id: targetUserId,
    action: "revoke_admin_privilege",
    before_json: { privilege: beforePrivilege, membership_id: existing.id },
    after_json: {
      privilege: "member",
      membership_revoked: true,
      axis: "admin_privilege",
      // Explicit: privilege revoke must not soft-delete the account.
      lifecycle_unchanged: true,
    },
  });

  return {
    ok: true,
    op: "revoke",
    before: { privilege: beforePrivilege === "super_admin" ? "super_admin" : "admin" },
    after: { privilege: "member" },
  };
}
