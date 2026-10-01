import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  isSuperAdminRole,
  loadStaffPermissionKeys,
  replaceStaffPermissions,
  uiRoleToAdminTier,
} from "@/lib/admin/admin-user-server";
import {
  resolveEffectiveAdminRole,
  revokeActiveAdminMembership,
  upsertActiveAdminMembership,
} from "@/lib/admin/admin-membership";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const staffId = id?.trim();
  if (!staffId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: {
    displayName?: string;
    role?: AdminRole;
    permissions?: AdminPermissionKey[];
    disabled?: boolean;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, role, nickname")
    .eq("id", staffId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const profileRoleRaw = (profile as { role?: string }).role ?? null;
  void profileRoleRaw;
  const effectiveRole = await resolveEffectiveAdminRole(sb, staffId).catch(() => null);
  if (!effectiveRole || !isPrivilegedAdminRole(effectiveRole)) {
    return NextResponse.json({ ok: false, error: "not_staff" }, { status: 400 });
  }
  if (isSuperAdminRole(effectiveRole) && body.role && body.role !== "master") {
    return NextResponse.json({ ok: false, error: "cannot_demote_super_admin" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    const name = String(body.displayName).trim();
    patch.nickname = name;
    patch.display_name = name;
  }
  if (body.role && !isSuperAdminRole(effectiveRole)) {
    if (body.role === "master") {
      return NextResponse.json({ ok: false, error: "cannot_promote_to_super_admin" }, { status: 400 });
    }
    await upsertActiveAdminMembership(sb, {
      userId: staffId,
      role: "admin",
      adminTier: uiRoleToAdminTier(body.role),
      grantedBy: actor.userId,
    });
  }
  if (body.disabled === true) {
    if (staffId === actor.userId) {
      return NextResponse.json({ ok: false, error: "self_mutation_forbidden" }, { status: 403 });
    }
    if (isSuperAdminRole(effectiveRole)) {
      return NextResponse.json({ ok: false, error: "cannot_disable_super_admin" }, { status: 403 });
    }
    const revoked = await revokeActiveAdminMembership(sb, {
      userId: staffId,
      revokedBy: actor.userId,
      reason: "staff_disabled",
    });
    if (!revoked.ok && revoked.error !== "not_admin") {
      return NextResponse.json({ ok: false, error: revoked.error }, { status: 400 });
    }
    // R6-B: privilege revoke only — do not withdraw the member profile.
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "staff",
      target_id: staffId,
      action: "revoke_admin_privilege",
      after_json: {
        membership_revoked: revoked.ok,
        axis: "staff_privilege",
        lifecycle_unchanged: true,
        via: "staff_patch_disabled",
      },
    });
  }
  // disabled=false does not re-grant membership or mutate profile lifecycle.

  if (Object.keys(patch).length > 0) {
    const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", staffId);
    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }
  }

  if (body.permissions && !isSuperAdminRole(effectiveRole)) {
    await replaceStaffPermissions(sb, staffId, body.permissions, actor.userId);
  }

  const passwordRaw = body.password;
  const hasPassword = passwordRaw !== undefined && passwordRaw !== null && String(passwordRaw).length > 0;
  if (hasPassword) {
    if (isSuperAdminRole(effectiveRole)) {
      return NextResponse.json({ ok: false, error: "forbidden_super_admin_target" }, { status: 403 });
    }
    const pwd = String(passwordRaw);
    if (pwd.length < 4) {
      return NextResponse.json({ ok: false, error: "password_min" }, { status: 400 });
    }
    if (pwd.length > 128) {
      return NextResponse.json({ ok: false, error: "password_too_long" }, { status: 400 });
    }
    const { error: pwdErr } = await sb.auth.admin.updateUserById(staffId, { password: pwd });
    if (pwdErr) {
      return NextResponse.json(
        { ok: false, error: "password_update_failed", message: pwdErr.message },
        { status: 500 },
      );
    }
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "staff",
      target_id: staffId,
      action: "admin_password_reset",
      after_json: { via: "staff_patch" },
    });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "staff",
    target_id: staffId,
    action: "update_staff",
    after_json: { ...patch, permissions: body.permissions },
  });

  const permissions = isSuperAdminRole(effectiveRole)
    ? []
    : body.permissions ?? (await loadStaffPermissionKeys(sb, staffId));

  return NextResponse.json({ ok: true, permissions });
}

/**
 * R6-B: REMOVE PLATFORM STAFF PRIVILEGE (not member account withdrawal).
 * Revokes active admin_memberships (+ clears admin_staff_permissions via revoke helper).
 * Preserves profiles.status / deleted_at / auth.users / member-owned data.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const staffId = id?.trim();
  if (!staffId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb, actor } = gate;
  if (staffId === actor.userId) {
    return NextResponse.json({ ok: false, error: "self_mutation_forbidden" }, { status: 403 });
  }

  const { data: profile } = await sb.from("profiles").select("id, role").eq("id", staffId).maybeSingle();
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const deleteEffective = await resolveEffectiveAdminRole(sb, staffId).catch(() => null);
  if (isSuperAdminRole(deleteEffective)) {
    return NextResponse.json({ ok: false, error: "cannot_disable_super_admin" }, { status: 403 });
  }

  const revoked = await revokeActiveAdminMembership(sb, {
    userId: staffId,
    revokedBy: actor.userId,
    reason: "staff_privilege_removed",
  });
  if (!revoked.ok && revoked.error === "last_super_admin") {
    return NextResponse.json({ ok: false, error: revoked.error }, { status: 400 });
  }
  if (!revoked.ok && revoked.error === "not_admin") {
    return NextResponse.json({ ok: false, error: "not_staff" }, { status: 400 });
  }
  if (!revoked.ok) {
    return NextResponse.json({ ok: false, error: revoked.error }, { status: 400 });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "staff",
    target_id: staffId,
    action: "revoke_admin_privilege",
    after_json: {
      membership_revoked: true,
      axis: "staff_privilege",
      lifecycle_unchanged: true,
      via: "staff_delete",
    },
  });

  return NextResponse.json({ ok: true, privilege: "member" });
}
