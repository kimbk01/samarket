import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";

/**
 * Platform Admin 판정 — Application membership-only
 * (same formula as `requireAdmin` / `isRouteAdmin`).
 * DB `is_platform_admin` is already membership-only; this wrapper matches it.
 */
export async function isUserPlatformAdminDb(sb: SupabaseClient<any>, userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  try {
    return await hasActiveAdminMembershipOrLegacyRole(sb, uid);
  } catch {
    return false;
  }
}
