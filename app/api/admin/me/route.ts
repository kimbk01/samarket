import { NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { adminTierToUiRole, loadEffectiveStaffPermissions } from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const { actor, sb } = gate;
  const profileRole = actor.profile.role ?? "admin";
  const adminTier = (actor.profile as { admin_tier?: string | null }).admin_tier ?? null;
  const uiRole: AdminRole = adminTierToUiRole(adminTier, profileRole);
  const permissions: AdminPermissionKey[] =
    actor.permissions.length > 0
      ? actor.permissions
      : await loadEffectiveStaffPermissions(sb, actor.userId, profileRole, adminTier);

  const loginId =
    String(actor.profile.username ?? "").trim() ||
    String(actor.profile.email ?? "").split("@")[0] ||
    actor.userId;

  return NextResponse.json({
    ok: true,
    userId: actor.userId,
    role: actor.isSuperAdmin ? "super_admin" : "admin",
    uiRole,
    adminTier,
    permissions,
    loginId,
    displayName: String(actor.profile.nickname ?? actor.profile.display_name ?? loginId),
  });
}
