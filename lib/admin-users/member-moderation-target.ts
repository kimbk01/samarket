/**
 * Member moderation target protection — Admin Membership HARD LOCK.
 * Same Super Admin authority as withdraw/delete. profiles.role is not consulted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { isSuperAdminRole } from "@/lib/admin/admin-user-server";

export type MemberModerationTargetGuard =
  | { ok: true }
  | {
      ok: false;
      error: "forbidden_super_admin_target" | "forbidden_admin_target";
      status: 403;
    };

export async function assertMemberModerationTargetAllowed(
  sb: SupabaseClient,
  input: { targetUserId: string; actorIsSuperAdmin: boolean },
): Promise<MemberModerationTargetGuard> {
  const membership = await loadActiveAdminMembership(sb, input.targetUserId).catch(() => null);
  if (isSuperAdminRole(membership?.role)) {
    return { ok: false, error: "forbidden_super_admin_target", status: 403 };
  }
  if (membership?.role === "admin" && !input.actorIsSuperAdmin) {
    return { ok: false, error: "forbidden_admin_target", status: 403 };
  }
  return { ok: true };
}
