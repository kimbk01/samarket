import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  isSuperAdminRole,
  loadStaffPermissionKeys,
  replaceStaffPermissions,
  uiRoleToAdminTier,
} from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";

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

  const profileRole = normalizeAdminRole((profile as { role?: string }).role);
  if (!isSuperAdminRole(profileRole) && profileRole !== "admin") {
    return NextResponse.json({ ok: false, error: "not_staff" }, { status: 400 });
  }
  if (isSuperAdminRole(profileRole) && body.role && body.role !== "master") {
    return NextResponse.json({ ok: false, error: "cannot_demote_super_admin" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    const name = String(body.displayName).trim();
    patch.nickname = name;
    patch.display_name = name;
  }
  if (body.role && !isSuperAdminRole(profileRole)) {
    if (body.role === "master") {
      return NextResponse.json({ ok: false, error: "cannot_promote_to_super_admin" }, { status: 400 });
    }
    patch.admin_tier = uiRoleToAdminTier(body.role);
  }
  if (body.disabled === true) {
    patch.status = "deleted";
    patch.deleted_at = new Date().toISOString();
  } else if (body.disabled === false) {
    patch.status = "verified_user";
    patch.deleted_at = null;
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", staffId);
    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }
  }

  if (body.permissions && !isSuperAdminRole(profileRole)) {
    await replaceStaffPermissions(sb, staffId, body.permissions, actor.userId);
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "staff",
    target_id: staffId,
    action: "update_staff",
    after_json: { ...patch, permissions: body.permissions },
  });

  const permissions = isSuperAdminRole(profileRole)
    ? []
    : body.permissions ?? (await loadStaffPermissionKeys(sb, staffId));

  return NextResponse.json({ ok: true, permissions });
}

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
  const { data: profile } = await sb.from("profiles").select("id, role").eq("id", staffId).maybeSingle();
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (isSuperAdminRole((profile as { role?: string }).role)) {
    return NextResponse.json({ ok: false, error: "cannot_disable_super_admin" }, { status: 403 });
  }

  const now = new Date().toISOString();
  await sb
    .from("profiles")
    .update({
      role: "user",
      is_admin: false,
      member_type: "normal",
      admin_tier: null,
      status: "deleted",
      deleted_at: now,
    })
    .eq("id", staffId);
  await sb.from("admin_staff_permissions").delete().eq("user_id", staffId);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "staff",
    target_id: staffId,
    action: "disable_staff",
  });

  return NextResponse.json({ ok: true });
}
