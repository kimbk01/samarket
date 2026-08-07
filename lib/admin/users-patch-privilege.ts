/**
 * Users PATCH privilege writer — Admin relationship changes MUST go through
 * admin_memberships helpers (same semantics as Staff Grant/Revoke).
 * Never write privileged profiles.role / is_admin via this path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEffectiveAdminRole,
  revokeActiveAdminMembership,
  upsertActiveAdminMembership,
} from "@/lib/admin/admin-membership";
import {
  defaultPermissionsForUiRole,
  isSuperAdminRole,
  replaceStaffPermissions,
} from "@/lib/admin/admin-user-server";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

export type UsersPatchMemberTypeInput = "normal" | "premium" | "admin" | "super_admin";

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
 * Apply admin privilege grant/revoke for Users PATCH `memberType`.
 * Order: membership authority mutation only (no legacy profile privilege mirror).
 */
export async function applyUsersPatchPrivilegeChange(
  sb: SupabaseClient,
  input: {
    userId: string;
    actorUserId: string;
    actorIsMaster: boolean;
    requestedMemberType: UsersPatchMemberTypeInput | null;
    currentProfileRole: string | null | undefined;
  }
): Promise<UsersPatchPrivilegeResult> {
  void input.currentProfileRole;
  const requested = input.requestedMemberType;
  if (!requested) {
    return { ok: true, privilegeHandled: false, memberTypePatch: null };
  }

  const effectiveRole = await resolveEffectiveAdminRole(sb, input.userId).catch(() => null);
  const isPriv = isPrivilegedAdminRole(effectiveRole);
  const isSA = isSuperAdminRole(effectiveRole);

  if (requested === "admin" || requested === "super_admin") {
    // Super admin shown as "admin" in UI — do not downgrade SA to admin via mirror
    if (isSA && requested === "admin") {
      return { ok: true, privilegeHandled: true, memberTypePatch: null };
    }
    if (!input.actorIsMaster) {
      return {
        ok: false,
        error: "forbidden_promote_admin",
        status: 403,
        message: "관리자 구분으로 수정은 최고 관리자만 할 수 있습니다.",
      };
    }
    if (isSA && requested === "super_admin") {
      return { ok: true, privilegeHandled: true, memberTypePatch: null };
    }

    const membershipRole = requested === "super_admin" ? "super_admin" : "admin";
    const upserted = await upsertActiveAdminMembership(sb, {
      userId: input.userId,
      role: membershipRole,
      adminTier: membershipRole === "admin" ? "operator" : null,
      grantedBy: input.actorUserId,
    });
    if (!upserted.ok) {
      return { ok: false, error: upserted.error, status: 500 };
    }
    if (membershipRole === "admin") {
      await replaceStaffPermissions(
        sb,
        input.userId,
        defaultPermissionsForUiRole("operator"),
        input.actorUserId
      );
    }
    return { ok: true, privilegeHandled: true, memberTypePatch: null };
  }

  // normal | premium
  if (isSA) {
    // Staff DELETE parity: never demote super_admin via this surface
    return {
      ok: false,
      error: "cannot_disable_super_admin",
      status: 403,
      message: "최고 관리자 계정의 구분을 일반·특별로 내릴 수 없습니다.",
    };
  }

  if (isPriv) {
    if (!input.actorIsMaster) {
      return {
        ok: false,
        error: "forbidden_demote_admin",
        status: 403,
        message: "관리자 구분을 내리는 것은 최고 관리자만 할 수 있습니다.",
      };
    }
    const revoked = await revokeActiveAdminMembership(sb, {
      userId: input.userId,
      revokedBy: input.actorUserId,
      reason: "users_patch_member_type",
    });
    if (!revoked.ok) {
      if (revoked.error === "last_super_admin") {
        return {
          ok: false,
          error: "cannot_disable_super_admin",
          status: 403,
        };
      }
      if (revoked.error !== "not_admin") {
        return { ok: false, error: revoked.error, status: 400 };
      }
    }
    // Revoke does not rewrite profiles.role / is_admin. Member classification only:
    if (requested === "premium") {
      return {
        ok: true,
        privilegeHandled: true,
        memberTypePatch: { member_type: "premium", is_special_member: true },
      };
    }
    return {
      ok: true,
      privilegeHandled: true,
      memberTypePatch: { member_type: "normal", is_special_member: false },
    };
  }

  // Non-admin Person — member classification only; never invent privileged role
  if (requested === "premium") {
    return {
      ok: true,
      privilegeHandled: false,
      memberTypePatch: {
        role: "user",
        is_admin: false,
        member_type: "premium",
        is_special_member: true,
      },
    };
  }
  return {
    ok: true,
    privilegeHandled: false,
    memberTypePatch: {
      role: "user",
      is_admin: false,
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
  if (m === "normal" || m === "premium" || m === "admin" || m === "super_admin") {
    return m;
  }
  return { error: "invalid_member_type" };
}
