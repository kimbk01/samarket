/**
 * Users PATCH member-classification writer.
 * CONTRACT: this surface never creates, updates, or revokes Admin authority.
 * Admin relationship changes belong exclusively to the Staff API.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveAdminRole } from "@/lib/admin/admin-membership";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

export type UsersPatchMemberTypeInput = "normal" | "premium";

export type UsersPatchPrivilegeResult =
  | {
      ok: true;
      /** Privilege handled by membership helper — do not also patch role/is_admin */
      privilegeHandled: boolean;
      /** Non-privilege member_type fields to merge into profiles update (no admin authority) */
      memberTypePatch: Record<string, unknown> | null;
    }
  | { ok: false; error: string; status: number; message?: string };

/**
 * Apply non-privileged member classification only.
 * Existing Admin targets must be managed through `/api/admin/staff`.
 */
export async function applyUsersPatchPrivilegeChange(
  sb: SupabaseClient,
  input: {
    userId: string;
    requestedMemberType: UsersPatchMemberTypeInput | null;
  }
): Promise<UsersPatchPrivilegeResult> {
  const requested = input.requestedMemberType;
  if (!requested) {
    return { ok: true, privilegeHandled: false, memberTypePatch: null };
  }

  const effectiveRole = await resolveEffectiveAdminRole(sb, input.userId).catch(() => null);
  const isPriv = isPrivilegedAdminRole(effectiveRole);

  if (isPriv) {
    return {
      ok: false,
      error: "use_staff_api_for_admin_authority",
      status: 409,
      message: "관리자 권한 변경은 관리자 관리 화면에서 처리해 주세요.",
    };
  }

  // Non-admin Person — member classification only; never invent privileged role
  if (requested === "premium") {
    return {
      ok: true,
      privilegeHandled: false,
      memberTypePatch: {
        member_type: "premium",
        is_special_member: true,
      },
    };
  }
  return {
    ok: true,
    privilegeHandled: false,
    memberTypePatch: {
      member_type: "normal",
      is_special_member: false,
    },
  };
}

export function parseUsersPatchMemberType(
  raw: unknown
): UsersPatchMemberTypeInput | null | { error: "invalid_member_type" } {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const m = String(raw).trim().toLowerCase();
  if (m === "normal" || m === "premium") {
    return m;
  }
  return { error: "invalid_member_type" };
}
