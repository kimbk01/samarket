import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";

/**
 * Route Handler용 관리자 판별.
 *
 * CANONICAL identity/role authority (Platform Admin APIs):
 * - session user: `getRouteUserId` → `getOptionalAuthenticatedUserId` (cookie JWT)
 * - session validity: `validateActiveSession`
 * - role: `profiles.role` via `getCurrentProfile` (inside validateActiveSession)
 *   + `isPrivilegedAdminRole` (same as `requireAdmin` / `requireAdminApiUser`)
 *
 * DO NOT re-fetch `profiles.role` through a second Supabase client
 * (`tryGetSupabaseForStores`). That dual reader caused same-session
 * 403↔200 divergence vs `requireAdminApiUser` (Slice dual-gate audit).
 *
 * - 로그인만으로 관리자가 되지 않음 — `profiles.role` 서버 기준만 허용.
 * - Writer/financial privilege is NOT widened: same `isPrivilegedAdminRole` set.
 */
export async function isRouteAdmin(): Promise<boolean> {
  const uid = await getRouteUserId();
  if (!uid) return false;
  const session = await validateActiveSession(uid);
  if (!session.ok) return false;
  return isPrivilegedAdminRole(session.profile.role);
}
