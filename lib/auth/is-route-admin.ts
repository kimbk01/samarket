import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
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
    return await hasActiveAdminMembershipOrLegacyRole(sb, uid);
  } catch {
    return false;
  }
}
