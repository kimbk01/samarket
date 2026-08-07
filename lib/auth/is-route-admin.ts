import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * Route Handler용 관리자 판별.
 *
 * CURRENT authority (transitional dual-read — same as `requireAdmin`):
 * - session user: `getRouteUserId` → cookie JWT
 * - session validity: `validateActiveSession`
 * - privilege: active `admin_memberships` OR transitional privileged `profiles.role`
 *   via `hasActiveAdminMembershipOrLegacyRole`
 *
 * DO NOT re-fetch profile through a second stores/chat client.
 * DO NOT invent a separate Admin formula here.
 */
export async function isRouteAdmin(): Promise<boolean> {
  const uid = await getRouteUserId();
  if (!uid) return false;
  const session = await validateActiveSession(uid);
  if (!session.ok) return false;

  // Fast path: transitional privileged profiles.role (same early allow as requireAdmin)
  if (isPrivilegedAdminRole(session.profile.role)) return true;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return false;
  try {
    return await hasActiveAdminMembershipOrLegacyRole(sb, uid, session.profile.role);
  } catch {
    return false;
  }
}
