/**
 * R6 Admin Privilege SSOT — independent axis from memberType / Store / lifecycle.
 * Canonical authority: active rows in `admin_memberships` (role admin | super_admin).
 * Normal member = absence of active membership (not a fabricated "member" role).
 */

import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";

export const MEMBER_PRIVILEGE_AUTHORITY_TABLE = "admin_memberships" as const;

/** Partial unique index — at most one active membership per user. */
export const MEMBER_PRIVILEGE_ONE_ACTIVE_PER_USER_INDEX =
  "admin_memberships_one_active_per_user_idx" as const;

/** Storage roles proven by schema/migrations — do not invent others. */
export const MEMBER_PRIVILEGE_STORAGE_ROLES = ["admin", "super_admin"] as const;
export type MemberPrivilegeStorageRole = (typeof MEMBER_PRIVILEGE_STORAGE_ROLES)[number];

/** Operator-facing privilege presentation (R0 labels). */
export type MemberPrivilegePresentation = "member" | "admin" | "super_admin";

export const MEMBER_PRIVILEGE_OPERATION_MATRIX = {
  NORMAL_TO_ADMIN: "SUPPORTED",
  ADMIN_TO_NORMAL: "SUPPORTED",
  ADMIN_TO_SUPER_ADMIN: "FORBIDDEN",
  SUPER_ADMIN_TO_ADMIN: "FORBIDDEN",
  NORMAL_TO_SUPER_ADMIN: "FORBIDDEN",
  SUPER_ADMIN_TO_NORMAL: "FORBIDDEN",
  SELF_PROMOTE: "FORBIDDEN",
  SELF_REVOKE: "FORBIDDEN",
  SELF_SUPER_CHANGE: "FORBIDDEN",
  DUPLICATE_PROMOTE: "CONFLICT",
  DUPLICATE_REVOKE: "NOT_APPLICABLE",
  LAST_SUPER_ADMIN_REVOKE: "FORBIDDEN",
  LAST_SUPER_ADMIN_DEMOTE: "FORBIDDEN",
  ORDINARY_ADMIN_MUTATE_SUPER: "FORBIDDEN",
} as const;

export type MemberPrivilegeOperationKey = keyof typeof MEMBER_PRIVILEGE_OPERATION_MATRIX;

export const MEMBER_ADMIN_PRIVILEGE_COPY = {
  section: MEMBER_ADMIN_COPY.admin_privilege,
  member: MEMBER_ADMIN_COPY.privilege_member,
  admin: MEMBER_ADMIN_COPY.privilege_admin,
  super_admin: MEMBER_ADMIN_COPY.privilege_super_admin,
  promote_cta: "관리자 권한 부여",
  revoke_cta: "관리자 권한 해제",
  promote_title: "관리자 권한 부여",
  revoke_title: "관리자 권한 해제",
  promote_body: "선택한 회원에게 관리자 권한을 부여합니다. 계정 상태·매장 관계·인증은 변경되지 않습니다.",
  revoke_body: "선택한 회원의 관리자 권한만 해제합니다. 계정 상태·매장 관계·인증은 변경되지 않습니다.",
  promote_primary: "권한 부여",
  revoke_primary: "권한 해제",
  current_label: "현재 권한",
  next_label: "변경 후 권한",
  target_label: "대상 회원",
  cannot_change: "권한을 변경할 수 없습니다",
  cannot_change_self: "자신의 권한은 변경할 수 없습니다",
  cannot_change_super: "최고 관리자 권한은 이 화면에서 변경할 수 없습니다",
  consequence_promote: "부여 후 관리자 메뉴·API에 접근할 수 있습니다.",
  consequence_revoke: "해제 후 관리자 메뉴·API에 접근할 수 없습니다.",
} as const;

export function memberPrivilegePresentationFromMembership(input: {
  hasActiveAdminMembership: boolean;
  role?: string | null;
}): MemberPrivilegePresentation {
  if (!input.hasActiveAdminMembership) return "member";
  const role = String(input.role ?? "").trim().toLowerCase();
  if (role === "super_admin" || role === "master") return "super_admin";
  return "admin";
}

export function memberPrivilegeLabelKo(presentation: MemberPrivilegePresentation): string {
  if (presentation === "super_admin") return MEMBER_ADMIN_PRIVILEGE_COPY.super_admin;
  if (presentation === "admin") return MEMBER_ADMIN_PRIVILEGE_COPY.admin;
  return MEMBER_ADMIN_PRIVILEGE_COPY.member;
}

export type MemberPrivilegeMutationOp = "promote" | "revoke";

export type MemberPrivilegeActionDecision = {
  op: MemberPrivilegeMutationOp | null;
  visible: boolean;
  enabled: boolean;
  labelKo: string;
  disabledReasonKo?: string;
  capId: "CAP-PRIV-PROMOTE" | "CAP-PRIV-REVOKE" | "CAP-PRIV-VIEW";
};

/**
 * Canonical R6 ActionPolicy for privilege mutation visibility.
 * Server re-validates every transition independently.
 */
export function resolveMemberPrivilegeActionPolicy(input: {
  canManagePrivilege: boolean;
  isSelf: boolean;
  targetPresentation: MemberPrivilegePresentation;
  terminalLifecycle?: boolean;
}): MemberPrivilegeActionDecision {
  const terminal = input.terminalLifecycle === true;
  if (terminal || !input.canManagePrivilege) {
    return {
      op: null,
      visible: false,
      enabled: false,
      labelKo: MEMBER_ADMIN_PRIVILEGE_COPY.section,
      capId: "CAP-PRIV-VIEW",
    };
  }

  if (input.targetPresentation === "super_admin") {
    return {
      op: null,
      visible: true,
      enabled: false,
      labelKo: MEMBER_ADMIN_PRIVILEGE_COPY.section,
      disabledReasonKo: input.isSelf
        ? MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_self
        : MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_super,
      capId: "CAP-PRIV-VIEW",
    };
  }

  if (input.isSelf) {
    return {
      op: null,
      visible: true,
      enabled: false,
      labelKo: MEMBER_ADMIN_PRIVILEGE_COPY.section,
      disabledReasonKo: MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_self,
      capId: "CAP-PRIV-VIEW",
    };
  }

  if (input.targetPresentation === "admin") {
    return {
      op: "revoke",
      visible: true,
      enabled: true,
      labelKo: MEMBER_ADMIN_PRIVILEGE_COPY.revoke_cta,
      capId: "CAP-PRIV-REVOKE",
    };
  }

  return {
    op: "promote",
    visible: true,
    enabled: true,
    labelKo: MEMBER_ADMIN_PRIVILEGE_COPY.promote_cta,
    capId: "CAP-PRIV-PROMOTE",
  };
}

/** Map API/machine errors to operator Korean (no schema leakage). */
export function memberPrivilegeOperatorErrorKo(error: string | null | undefined): string {
  const e = String(error ?? "").trim();
  switch (e) {
    case "self_mutation_forbidden":
      return MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_self;
    case "cannot_modify_super_admin":
    case "cannot_demote_super_admin":
    case "cannot_promote_to_super_admin":
    case "use_super_admin_promotion":
    case "last_super_admin":
      return MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_super;
    case "already_admin":
      return "이미 관리자 권한이 있습니다.";
    case "not_admin":
      return "관리자 권한이 없는 회원입니다.";
    case "super_admin_only":
    case "forbidden":
      return "권한이 없습니다.";
    case "not_found":
      return "회원을 찾을 수 없습니다.";
    default:
      return MEMBER_ADMIN_COPY.mutation_failed;
  }
}
