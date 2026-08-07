import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";

/**
 * Platform Admin 판정 — CURRENT dual-read (membership OR transitional profiles.role).
 * Same formula as `requireAdmin` / `isRouteAdmin` (via `hasActiveAdminMembershipOrLegacyRole`).
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
