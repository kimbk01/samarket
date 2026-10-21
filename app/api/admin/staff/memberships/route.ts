import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escapeAdminIlike,
  isAdminListUuid,
  quotePostgrestOrValue,
  sanitizeAdminListSearch,
} from "@/lib/admin/pagination/parse-admin-list-page";
import { parseMemberOpsListPage } from "@/lib/admin/member-ops-list/member-ops-list-page";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  adminTierToUiRole,
  loadStaffPermissionsMap,
  resolveEffectiveStaffPermissionsFromStored,
} from "@/lib/admin/admin-user-server";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  parseAdminStaffStatusFilter,
  type AdminStaffMembershipRow,
  type AdminStaffStatusFilter,
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

const MEMBERSHIP_SELECT =
  "id, user_id, role, admin_tier, status, granted_at, granted_by, revoked_at, revoked_by, revoke_reason, created_at";

/**
 * 검색어 → 대상 회원 id. null = 검색 없음.
 * 예전 화면 검색과 같은 범위: 닉네임·아이디(username·이메일)·**회원 ID 일부** (대소문자 무시 부분 일치).
 * 회원 ID 일부 일치는 관리자 멤버십 회원(admin_memberships.user_id — 관리자 수만큼) 안에서 찾는다
 * (uuid 열은 PostgREST ilike 불가).
 */
async function resolveSearchUserIds(sb: SupabaseClient, q: string): Promise<string[] | null> {
  if (!q) return null;
  if (isAdminListUuid(q)) return [q];
  const pat = quotePostgrestOrValue(`%${escapeAdminIlike(q)}%`);
  const ids = new Set<string>();
  const { data } = await sb
    .from("profiles")
    .select("id")
    .or(`nickname.ilike.${pat},username.ilike.${pat},email.ilike.${pat}`);
  for (const p of (data ?? []) as { id?: string }[]) if (p.id) ids.add(String(p.id));
  const needle = q.toLowerCase();
  if (/^[0-9a-f-]+$/.test(needle)) {
    const { data: members } = await sb.from("admin_memberships").select("user_id");
    for (const m of (members ?? []) as { user_id?: string }[]) {
      const id = String(m.user_id ?? "");
      if (id && id.toLowerCase().includes(needle)) ids.add(id);
    }
  }
  return [...ids];
}

type SegmentResult = { rows: MembershipRow[]; total: number; error: string | null };

/**
 * 한 상태 묶음(활성 / 활성 외)의 한 구간 — 정렬: (활성 외는 정지 → 해제) · 부여 시각 최신순.
 * `to < from` 이면 건수만 센다 (head 요청 — 범위 밖 offset 요청을 만들지 않는다).
 */
async function loadSegment(
  sb: SupabaseClient,
  segment: "active" | "inactive",
  userIds: string[] | null,
  from: number,
  to: number
): Promise<SegmentResult> {
  const countOnly = to < from;
  let q = sb.from("admin_memberships").select(MEMBERSHIP_SELECT, { count: "exact", head: countOnly });
  q = segment === "active" ? q.eq("status", "active") : q.neq("status", "active");
  if (userIds) q = q.in("user_id", userIds);
  if (countOnly) {
    const { error, count } = await q;
    return error ? { rows: [], total: 0, error: "db_error" } : { rows: [], total: count ?? 0, error: null };
  }
  if (segment === "inactive") q = q.order("status", { ascending: false });
  const { data, error, count } = await q
    .order("granted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) return { rows: [], total: 0, error: "db_error" };
  return { rows: (data ?? []) as MembershipRow[], total: count ?? 0, error: null };
}

/**
 * 상태 필터 + 검색 + 서버 페이지. 정렬 = 활성 먼저 → 정지 → 해제, 각 묶음 안은 부여 시각 최신순
 * (`sortAdminStaffMemberships` 와 같은 순서). 「전체」는 활성 묶음 다음에 활성 외 묶음을 이어 붙여 쪽을 나눈다.
 */
async function loadMembershipPage(
  sb: SupabaseClient,
  status: AdminStaffStatusFilter,
  userIds: string[] | null,
  page: { limit: number; offset: number }
): Promise<SegmentResult> {
  const start = page.offset;
  const end = page.offset + page.limit - 1;
  if (status === "active") return loadSegment(sb, "active", userIds, start, end);
  if (status === "revoked") return loadSegment(sb, "inactive", userIds, start, end);
  const activeCount = await loadSegment(sb, "active", userIds, 0, -1);
  if (activeCount.error) return activeCount;
  const activeTotal = activeCount.total;
  let activeRows: MembershipRow[] = [];
  if (start < activeTotal) {
    const head = await loadSegment(sb, "active", userIds, start, Math.min(end, activeTotal - 1));
    if (head.error) return head;
    activeRows = head.rows;
  }
  const tailFrom = Math.max(0, start - activeTotal);
  const tailTo = end - activeTotal;
  const tail = await loadSegment(sb, "inactive", userIds, tailFrom, tailTo);
  if (tail.error) return tail;
  return { rows: [...activeRows, ...tail.rows], total: activeTotal + tail.total, error: null };
}

/**
 * GET /api/admin/staff/memberships — 관리자 계정·권한 화면 (super_admin 전용, 설계 v4 F3).
 * 활성 + 해제(정지 포함) admin_memberships 이력. 쓰기는 기존 API(`/api/admin/staff`·`[id]`·
 * `/api/admin/users/[id]/privilege`) 그대로 — 이 라우트는 읽기만 한다.
 * R7 목록 표준: `status`(active|revoked|all, 기본 active) · `q` · `limit`(20/50/100)·`offset` 서버 페이지 + `total`.
 * 예전 1,000건 고정 상한 + 화면 메모리 페이지 제거. 호출자: `AdminStaffAccountsPage` 하나.
 */
export async function GET(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const { sb } = gate;

  const sp = new URL(req.url).searchParams;
  const page = parseMemberOpsListPage(sp);
  const status = parseAdminStaffStatusFilter(sp.get("status") || "active");
  const search = sanitizeAdminListSearch(sp.get("q"));
  const userIds = await resolveSearchUserIds(sb, search);
  if (userIds && userIds.length === 0) {
    return NextResponse.json({ ok: true, memberships: [], total: 0, limit: page.limit, offset: page.offset });
  }

  const result = await loadMembershipPage(sb, status, userIds, page);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  const memberships = result.rows;

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
    if (pErr) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
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
    // GET /api/admin/staff 와 같은 규칙 — 저장된 권한 행이 없으면 역할 기본 권한, 저장된 [] 는 권한 없음 (AD-05).
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
      permissions: isActiveAdmin ? resolveEffectiveStaffPermissionsFromStored(stored, uiRole) : [],
      grantedAt: m.granted_at ?? m.created_at,
      grantedBy: m.granted_by,
      grantedByNickname: nick(m.granted_by),
      revokedAt: m.revoked_at,
      revokedBy: m.revoked_by,
      revokedByNickname: nick(m.revoked_by),
      revokeReason: m.revoke_reason,
    };
  });

  return NextResponse.json({
    ok: true,
    memberships: rows,
    total: result.total,
    limit: page.limit,
    offset: page.offset,
  });
}
