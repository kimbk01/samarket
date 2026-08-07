import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  adminTierToUiRole,
  defaultPermissionsForUiRole,
  loadStaffPermissionsMap,
  replaceStaffPermissions,
  uiRoleToAdminTier,
} from "@/lib/admin/admin-user-server";
import { upsertActiveAdminMembership } from "@/lib/admin/admin-membership";
import { buildManualMemberAuthEmail } from "@/lib/auth/manual-member-email";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  username: string | null;
  email: string | null;
  nickname: string | null;
  display_name: string | null;
  role: string | null;
  status: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

function mapStaffRow(
  row: StaffRow,
  permissions: AdminPermissionKey[]
): {
  id: string;
  loginId: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermissionKey[];
  createdAt: string;
  disabled: boolean;
} {
  const loginId =
    String(row.username ?? "").trim() ||
    String(row.email ?? "").split("@")[0] ||
    row.id;
  const displayName = String(row.nickname ?? row.display_name ?? loginId);
  const uiRole = adminTierToUiRole(null, row.role);
  return {
    id: row.id,
    loginId,
    displayName,
    role: uiRole,
    permissions,
    createdAt: row.created_at ?? new Date().toISOString(),
    disabled: Boolean(row.deleted_at) || String(row.status ?? "") === "deleted",
  };
}

export async function GET() {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { sb } = gate;
  const { data, error } = await sb
    .from("profiles")
    .select("id, username, email, nickname, display_name, role, status, deleted_at, created_at")
    .in("role", ["admin", "super_admin"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as StaffRow[];
  const adminIds = rows
    .filter((row) => normalizeAdminRole(row.role) !== "super_admin")
    .map((row) => row.id);
  const permMap = await loadStaffPermissionsMap(sb, adminIds).catch(
    () => new Map<string, AdminPermissionKey[]>()
  );
  const staff = rows.map((row) => {
    const uiRole = adminTierToUiRole(null, row.role);
    const perms =
      normalizeAdminRole(row.role) === "super_admin"
        ? defaultPermissionsForUiRole("master")
        : permMap.get(row.id)?.length
          ? (permMap.get(row.id) as AdminPermissionKey[])
          : defaultPermissionsForUiRole(uiRole);
    return mapStaffRow(row, perms);
  });

  return NextResponse.json({ ok: true, staff });
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    loginId?: string;
    password?: string;
    displayName?: string;
    role?: string;
    permissions?: AdminPermissionKey[];
    userId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const existingUserId = String(body.userId ?? "").trim();

  if (existingUserId) {
    const { data: profile } = await sb
      .from("profiles")
      .select("id, role")
      .eq("id", existingUserId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (isPrivilegedAdminRole((profile as { role?: string }).role)) {
      return NextResponse.json({ ok: false, error: "already_admin" }, { status: 400 });
    }

    const uiRole = (String(body.role ?? "operator") as AdminRole) || "operator";
    if (uiRole === "master") {
      return NextResponse.json({ ok: false, error: "use_super_admin_promotion" }, { status: 400 });
    }

    const permissions =
      Array.isArray(body.permissions) && body.permissions.length > 0
        ? body.permissions
        : defaultPermissionsForUiRole(uiRole);

    await upsertActiveAdminMembership(sb, {
      userId: existingUserId,
      role: "admin",
      adminTier: uiRoleToAdminTier(uiRole),
      grantedBy: actor.userId,
    });
    await replaceStaffPermissions(sb, existingUserId, permissions, actor.userId);

    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "staff",
      target_id: existingUserId,
      action: "promote_to_admin",
      after_json: { role: uiRole, permissions, membership: true },
    });

    return NextResponse.json({ ok: true, id: existingUserId });
  }

  const loginId = String(body.loginId ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim() || loginId;
  const uiRole = (String(body.role ?? "operator") as AdminRole) || "operator";

  if (loginId.length < 2) {
    return NextResponse.json({ ok: false, error: "login_id_required" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ ok: false, error: "password_min" }, { status: 400 });
  }
  if (uiRole === "master") {
    return NextResponse.json({ ok: false, error: "cannot_create_super_admin" }, { status: 400 });
  }

  const email = buildManualMemberAuthEmail(loginId);
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: displayName, username: loginId, login_id: loginId, auth_provider: "admin_manual" },
  } as never);

  if (createErr || !created.user) {
    return NextResponse.json({ ok: false, error: createErr?.message ?? "auth_create_failed" }, { status: 500 });
  }

  const userId = created.user.id;
  const permissions =
    Array.isArray(body.permissions) && body.permissions.length > 0
      ? body.permissions
      : defaultPermissionsForUiRole(uiRole);

  await sb.from("profiles").upsert({
    id: userId,
    email,
    auth_login_email: email,
    username: loginId,
    nickname: displayName,
    display_name: displayName,
    role: "admin",
    is_admin: true,
    member_type: "admin",
    admin_tier: uiRoleToAdminTier(uiRole),
    status: "verified_user",
    provider: "manual",
    auth_provider: "admin_manual",
    manual_account_type: "admin",
  });

  await upsertActiveAdminMembership(sb, {
    userId,
    role: "admin",
    adminTier: uiRoleToAdminTier(uiRole),
    grantedBy: actor.userId,
  });

  await replaceStaffPermissions(sb, userId, permissions, actor.userId);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "staff",
    target_id: userId,
    action: "create_admin",
    after_json: { loginId, role: uiRole, permissions, membership: true },
  });

  return NextResponse.json({ ok: true, id: userId });
}
