import { NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { adminTierToUiRole, loadEffectiveStaffPermissions } from "@/lib/admin/admin-user-server";
import { isDeployOwnerUserId } from "@/lib/admin/deploy-promotion/deploy-owner";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";
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
    /** 배포 담당자(`DIBAY_DEPLOY_OWNER_IDS`) — `requireDeployOwner` 와 같은 판정. UI 버튼 노출용(서버 가드는 그대로). */
    isDeployOwner: actor.isSuperAdmin && isDeployOwnerUserId(actor.userId),
    /** 정지된 운영자 — `requireCommunityAdmin("promotion")` 과 같은 판정. 홍보 화면 쓰기 비활성 표시용(서버 가드는 그대로). */
    accountSuspended: !actor.isSuperAdmin && isSuspendedMemberAccount(actor.profile),
  });
}
