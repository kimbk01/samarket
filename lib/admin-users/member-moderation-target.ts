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
    }
  | {
      /** AD-06: 대상 관리자 여부를 확인하지 못함 — 일반 회원으로 간주하지 않는다(fail-closed). */
      ok: false;
      error: "admin_target_check_failed";
      status: 503;
    };

export async function assertMemberModerationTargetAllowed(
  sb: SupabaseClient,
  input: { targetUserId: string; actorIsSuperAdmin: boolean },
): Promise<MemberModerationTargetGuard> {
  let membership: Awaited<ReturnType<typeof loadActiveAdminMembership>>;
  try {
    membership = await loadActiveAdminMembership(sb, input.targetUserId);
  } catch {
    return { ok: false, error: "admin_target_check_failed", status: 503 };
  }
  if (isSuperAdminRole(membership?.role)) {
    return { ok: false, error: "forbidden_super_admin_target", status: 403 };
  }
  if (membership?.role === "admin" && !input.actorIsSuperAdmin) {
    return { ok: false, error: "forbidden_admin_target", status: 403 };
  }
  return { ok: true };
}
