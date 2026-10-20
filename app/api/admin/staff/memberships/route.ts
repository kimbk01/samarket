import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { adminTierToUiRole, defaultPermissionsForUiRole, loadStaffPermissionsMap } from "@/lib/admin/admin-user-server";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  sortAdminStaffMemberships,
  type AdminStaffMembershipRow,
} from "@/lib/admin-users/admin-staff-membership-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipRow = {
  id: string;
  user_id: string;
  role: string;
  admin_tier: string | null;
  status: string;
  granted_at: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string | null;
};

type ProfileLite = { id: string; nickname: string | null; username: string | null; email: string | null };

/**
 * GET /api/admin/staff/memberships — 관리자 계정·권한 화면 (super_admin 전용, 설계 v4 F3).
 * 활성 + 해제(정지 포함) admin_memberships 전체 이력. 쓰기는 기존 API(`/api/admin/staff`·`[id]`·
 * `/api/admin/users/[id]/privilege`) 그대로 — 이 라우트는 읽기만 한다.
 */
export async function GET() {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const { sb } = gate;

  const { data, error } = await sb
    .from("admin_memberships")
    .select("id, user_id, role, admin_tier, status, granted_at, granted_by, revoked_at, revoked_by, revoke_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const memberships = (data ?? []) as MembershipRow[];

  const profileIds = new Set<string>();
  for (const m of memberships) {
    profileIds.add(m.user_id);
    if (m.granted_by) profileIds.add(m.granted_by);
    if (m.revoked_by) profileIds.add(m.revoked_by);
  }
  const profileById = new Map<string, ProfileLite>();
  if (profileIds.size) {
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select("id, nickname, username, email")
      .in("id", [...profileIds]);
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    for (const p of (profiles ?? []) as ProfileLite[]) profileById.set(String(p.id), p);
  }

  const activeAdminIds = memberships
    .filter((m) => m.status === "active" && normalizeAdminRole(m.role) !== "super_admin")
    .map((m) => m.user_id);
  const permMap = await loadStaffPermissionsMap(sb, activeAdminIds).catch(
    () => new Map<string, AdminPermissionKey[]>()
  );

  const nick = (id: string | null) => (id ? profileById.get(id)?.nickname ?? null : null);
  const rows: AdminStaffMembershipRow[] = memberships.map((m) => {
    const p = profileById.get(m.user_id);
    const loginId = String(p?.username ?? "").trim() || String(p?.email ?? "").split("@")[0] || null;
    const isActiveAdmin = m.status === "active" && normalizeAdminRole(m.role) !== "super_admin";
    const uiRole = adminTierToUiRole(m.admin_tier, m.role);
    // GET /api/admin/staff 와 같은 규칙 — 저장된 권한이 없으면 역할 기본 권한.
    const stored = permMap.get(m.user_id);
    return {
      membershipId: m.id,
      userId: m.user_id,
      nickname: p?.nickname ?? null,
      loginId,
      role: m.role,
      uiRole,
      adminTier: m.admin_tier,
      status: m.status,
      permissions: isActiveAdmin ? (stored?.length ? stored : defaultPermissionsForUiRole(uiRole)) : [],
      grantedAt: m.granted_at ?? m.created_at,
      grantedBy: m.granted_by,
      grantedByNickname: nick(m.granted_by),
      revokedAt: m.revoked_at,
      revokedBy: m.revoked_by,
      revokedByNickname: nick(m.revoked_by),
      revokeReason: m.revoke_reason,
    };
  });

  return NextResponse.json({ ok: true, memberships: sortAdminStaffMemberships(rows) });
}
