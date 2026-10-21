import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { isSuspendedNonSuperAdminActor } from "@/lib/admin/require-admin-api";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * Route Handler용 관리자 판별.
 *
 * Application authority (membership-only — same as `requireAdmin`):
 * - session user: `getRouteUserId` → cookie JWT
 * - session validity: `validateActiveSession`
 * - privilege: active `admin_memberships` only via `hasActiveAdminMembershipOrLegacyRole`
 * - 정지 회원 운영자(super_admin 제외)는 거부 — `requireAdminApiUser` 와 동일 규칙 (AD-07)
 *
 * DO NOT re-fetch profile through a second stores/chat client.
 * DO NOT invent a separate Admin formula here.
 * DO NOT use profiles.role as allow/deny fallback.
 */
export async function isRouteAdmin(): Promise<boolean> {
  const uid = await getRouteUserId();
  if (!uid) return false;
  const session = await validateActiveSession(uid);
  if (!session.ok) return false;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return false;
  try {
    if (!(await hasActiveAdminMembershipOrLegacyRole(sb, uid))) return false;
  } catch {
    return false;
  }
  return !(await isSuspendedNonSuperAdminActor(uid, session.profile));
}
