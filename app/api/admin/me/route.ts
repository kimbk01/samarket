import { NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { adminTierToUiRole, loadEffectiveStaffPermissions } from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const { actor, sb } = gate;
  const membership = await loadActiveAdminMembership(sb, actor.userId).catch(() => null);
  const membershipTier = membership?.admin_tier ?? null;
  // uiRole must not be elevated by stale profiles.role mirrors (R6 privilege axis).
  const uiRole: AdminRole = actor.isSuperAdmin
    ? "master"
    : adminTierToUiRole(membershipTier, actor.role);
  const permissions: AdminPermissionKey[] =
    actor.permissions.length > 0
      ? actor.permissions
      : await loadEffectiveStaffPermissions(sb, actor.userId, actor.role, membershipTier);

  const loginId =
    String(actor.profile.username ?? "").trim() ||
    String(actor.profile.email ?? "").split("@")[0] ||
    actor.userId;

  return NextResponse.json({
    ok: true,
    userId: actor.userId,
    role: actor.isSuperAdmin ? "super_admin" : "admin",
    uiRole,
    adminTier: membershipTier,
    permissions,
    loginId,
    displayName: String(actor.profile.nickname ?? actor.profile.display_name ?? loginId),
  });
}
