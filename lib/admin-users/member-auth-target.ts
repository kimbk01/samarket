/**
 * Sensitive Auth mutation target protection for Member Control Center.
 * Aligns password writers with delete/moderation Super Admin protection.
 * Authority: active admin_memberships only — profiles.role is not consulted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { isSuperAdminRole } from "@/lib/admin/admin-user-server";

export type MemberAuthTargetClass = "general_member" | "admin" | "super_admin";

export type MemberPasswordTargetGuard =
  | { ok: true; targetClass: MemberAuthTargetClass }
  | {
      ok: false;
      error: "forbidden_super_admin_target" | "forbidden_admin_target";
      status: 403;
      targetClass: MemberAuthTargetClass;
    };

export async function classifyMemberAuthTarget(
  sb: SupabaseClient,
  targetUserId: string,
): Promise<MemberAuthTargetClass> {
  const membership = await loadActiveAdminMembership(sb, targetUserId).catch(() => null);
  if (isSuperAdminRole(membership?.role)) return "super_admin";
  if (membership?.role === "admin") return "admin";
  return "general_member";
}

/**
 * Password / sensitive Auth credential changes:
 * - GENERAL MEMBER → allowed (caller must already hold `users` / SA)
 * - ADMIN → Super Admin actor only
 * - SUPER ADMIN → always blocked (same as delete/moderation)
 */
export async function assertMemberPasswordChangeAllowed(
  sb: SupabaseClient,
  input: { targetUserId: string; actorIsSuperAdmin: boolean },
): Promise<MemberPasswordTargetGuard> {
  const targetClass = await classifyMemberAuthTarget(sb, input.targetUserId);
  if (targetClass === "super_admin") {
    return { ok: false, error: "forbidden_super_admin_target", status: 403, targetClass };
  }
  if (targetClass === "admin" && !input.actorIsSuperAdmin) {
    return { ok: false, error: "forbidden_admin_target", status: 403, targetClass };
  }
  return { ok: true, targetClass };
}
