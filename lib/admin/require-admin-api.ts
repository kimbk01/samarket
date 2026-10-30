import { NextResponse } from "next/server";
import type { ProfileRow } from "@/lib/profile/types";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { requireAdmin, requireAuth, validateActiveSession } from "@/lib/auth/server-guards";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";
import { resolveEffectiveAdminRole, type AdminMembershipRow } from "@/lib/admin/admin-membership";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * AD-07 (Owner 결정 §5.4): 정지(suspended) 운영자는 모든 관리자 경로 차단 — 최고관리자만 제외(잠김 방지).
 * 정지가 아니면 DB 조회 없음. 정지인데 최고관리자 여부를 확인할 수 없으면 차단(fail-closed).
 */
export async function isSuspendedNonSuperAdminActor(
  userId: string,
  profile: Pick<ProfileRow, "status"> | null | undefined,
  /** 같은 요청에서 이미 읽은 활성 membership — 넘기면 다시 조회하지 않는다. */
  membership?: Pick<AdminMembershipRow, "role"> | null
): Promise<boolean> {
  if (!isSuspendedMemberAccount(profile)) return false;
  if (membership) return normalizeAdminRole(membership.role) !== "super_admin";
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return true;
  try {
    const role = await resolveEffectiveAdminRole(sb, userId);
    return normalizeAdminRole(role) !== "super_admin";
  } catch {
    return true;
  }
}

/**
 * 관리자 API 공통 가드. 같은 요청 안에서 profiles·admin_memberships 를 각 1회만 읽고,
 * 읽은 행을 반환한다 — `requireAdminApiActor` 등 호출자는 다시 조회하지 않는다.
 */
export async function requireAdminApiUser(): Promise<
  | { ok: true; userId: string; profile: ProfileRow; membership: AdminMembershipRow }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return { ok: false, response: session.response };
  const admin = await requireAdmin(auth.userId, { profile: session.profile });
  if (!admin.ok) return { ok: false, response: admin.response };
  if (await isSuspendedNonSuperAdminActor(auth.userId, admin.profile, admin.membership)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_actor_suspended" }, { status: 403 }),
    };
  }
  return { ok: true, userId: auth.userId, profile: admin.profile, membership: admin.membership };
}

/**
 * RSC·서버 유틸 — 관리자일 때만 userId 반환 (페이지 시드 등). API 라우트는 `requireAdminApiUser` 유지.
 */
export async function getOptionalAdminUserId(): Promise<string | null> {
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) return null;
  const session = await validateActiveSession(userId);
  if (!session.ok) return null;
  const admin = await requireAdmin(userId);
  if (!admin.ok) return null;
  if (await isSuspendedNonSuperAdminActor(userId, admin.profile)) return null;
  return userId;
}
