/**
 * Member Admin — Owner-facing Korean Copy SSOT (P1).
 * Operator surfaces must use human Korean. Internal codes stay in logs/system detail only.
 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 문구 키 — 화면은 `t(MEMBER_ADMIN_COPY_KEY.x)` 로 그린다(언어 SSOT L25). */
export const MEMBER_ADMIN_COPY_KEY = {
  member_management: "admin_member_copy_member_management",
  member_register: "admin_member_copy_member_register",
  edit_profile: "admin_member_copy_edit_profile",
  password_manage: "admin_member_copy_password_manage",
  password_change: "admin_member_copy_password_change",
  password_temp_set_title: "admin_member_copy_password_temp_set_title",
  password_temp_set_primary: "admin_member_copy_password_temp_set_primary",
  password_temp_set_body: "admin_member_copy_password_temp_set_body",
  password_new_label: "admin_member_copy_password_new_label",
  password_new_confirm_label: "admin_member_copy_password_new_confirm_label",
  member_create_title: "admin_member_copy_member_create_title",
  member_edit_title: "admin_member_copy_member_edit_title",
  store_ops: "admin_member_copy_store_ops",
  admin_privilege: "admin_member_copy_admin_privilege",
  status_active: "admin_member_copy_status_active",
  status_needs_review: "admin_member_copy_status_needs_review",
  status_suspended: "admin_member_copy_status_suspended",
  status_unsuspend: "admin_member_copy_status_unsuspend",
  status_blocked: "admin_member_copy_status_blocked",
  status_unblock: "admin_member_copy_status_unblock",
  status_withdrawn: "admin_member_copy_status_withdrawn",
  status_purged: "admin_member_copy_status_purged",
  ops_history: "admin_member_copy_ops_history",
  moderation: "admin_member_copy_moderation",
  warn: "admin_member_copy_warn",
  cancel: "admin_member_copy_cancel",
  confirm: "admin_member_copy_confirm",
  save_changes: "admin_member_copy_save_changes",
  continue_editing: "admin_member_copy_continue_editing",
  discard_changes: "admin_member_copy_discard_changes",
  dirty_close_title: "admin_member_copy_dirty_close_title",
  dirty_close_description: "admin_member_copy_dirty_close_description",
  privilege_member: "admin_member_copy_privilege_member",
  privilege_operator: "admin_member_copy_privilege_operator",
  privilege_admin: "admin_member_copy_privilege_admin",
  privilege_super_admin: "admin_member_copy_privilege_super_admin",
  origin_admin_manual: "admin_member_copy_origin_admin_manual",
  origin_user_signup: "admin_member_copy_origin_user_signup",
  origin_kakao: "admin_member_copy_origin_kakao",
  store_operator: "admin_member_copy_store_operator",
  system_member_key: "admin_member_copy_system_member_key",
  mutation_failed: "admin_action_failed",
  loading: "admin_member_copy_loading",
  dibay_id_change: "admin_member_copy_dibay_id_change",
  dibay_id_change_title: "admin_member_copy_dibay_id_change_title",
  dibay_id_current_label: "admin_member_copy_dibay_id_current_label",
  dibay_id_new_label: "admin_member_copy_dibay_id_new_label",
  dibay_id_change_primary: "admin_member_copy_dibay_id_change_primary",
  dibay_id_change_body: "admin_member_copy_dibay_id_change_body",
  verify_manage: "admin_member_copy_verify_manage",
  verify_manage_title: "admin_member_copy_verify_manage_title",
  verify_phone_label: "admin_member_copy_verify_phone_label",
  verify_status_label: "admin_member_copy_verify_status_label",
  verify_status_done: "admin_member_copy_verify_status_done",
  verify_status_pending: "admin_member_copy_verify_status_pending",
  verify_approve: "admin_member_copy_verify_approve",
  verify_reset: "admin_member_copy_verify_reset",
  verify_approve_confirm_title: "admin_member_copy_verify_approve_confirm_title",
  verify_approve_confirm_body: "admin_member_copy_verify_approve_confirm_body",
  verify_reset_confirm_title: "admin_member_copy_verify_reset_confirm_title",
  verify_reset_confirm_body: "admin_member_copy_verify_reset_confirm_body",
  verify_save_phone: "admin_member_copy_verify_save_phone",
  verify_no_phone_for_approve: "admin_member_copy_verify_no_phone_for_approve",
  store_relation_manage: "admin_member_copy_store_relation_manage",
  store_relation_title: "admin_member_copy_store_relation_title",
  privilege_promote: "admin_member_copy_privilege_promote",
  privilege_revoke: "admin_member_copy_privilege_revoke",
  privilege_cannot_change: "admin_member_copy_privilege_cannot_change",
  privilege_cannot_change_self: "admin_member_copy_privilege_cannot_change_self",
} as const satisfies Record<string, MessageKey>;

export type MemberAdminCopyKey = keyof typeof MEMBER_ADMIN_COPY_KEY;

/** 한국어 값(기존 호출부·검사 호환) — 카탈로그 한국어에서 만든다. */
export const MEMBER_ADMIN_COPY = Object.fromEntries(
  (Object.keys(MEMBER_ADMIN_COPY_KEY) as MemberAdminCopyKey[]).map((k) => [k, translate("ko", MEMBER_ADMIN_COPY_KEY[k])]),
) as { readonly [K in MemberAdminCopyKey]: string };


/** Developer / schema terms that must never appear on operator UI surfaces covered by P1. */
export const MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS = [
  "ADMIN_MANUAL",
  "STORE_OWNER",
  "profiles",
  "profiles에 반영",
  "auth.users",
  "RPC",
  "RLS",
  "PATCH",
  "deleted_at",
  "owner_user_id",
  "ban_duration",
  "account_state_unavailable",
  "USER_SIGNUP",
  "SUPER_ADMIN",
  "verified_user",
  "needs_review",
] as const;

/**
 * Placeholder operator chrome that must never be treated as final approved capability copy.
 * R7 owns moderation execution restoration; R1 only guards against false PASS.
 */
export const MEMBER_ADMIN_FORBIDDEN_PLACEHOLDER_FINAL_COPY = [
  "표시만",
] as const;

/** Collapsed Store/Admin axis — deleted by R0. Must not reappear as privilege/store authority UI. */
export const MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL = "회원 구분" as const;

export function memberAdminCopy(key: MemberAdminCopyKey, lang: AppLanguageCode = "ko"): string {
  return translate(lang, MEMBER_ADMIN_COPY_KEY[key]);
}

export function findForbiddenOperatorTerms(text: string): string[] {
  const hay = String(text ?? "");
  return MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS.filter((term) => hay.includes(term));
}

export function assertNoForbiddenOperatorTerms(text: string): void {
  const hits = findForbiddenOperatorTerms(text);
  if (hits.length > 0) {
    throw new Error(`Forbidden operator terminology: ${hits.join(", ")}`);
  }
}

export type MemberAdminLifecycleState = "ACTIVE" | "SUSPENDED" | "BLOCKED" | "WITHDRAWN" | "PURGED" | "NEEDS_REVIEW";

/** Map internal lifecycle codes → operator copy key (never expose raw enum). */
export function memberAdminLifecycleCopyKey(state: MemberAdminLifecycleState): MemberAdminCopyKey {
  switch (state) {
    case "ACTIVE":
      return "status_active";
    case "NEEDS_REVIEW":
      return "status_needs_review";
    case "SUSPENDED":
      return "status_suspended";
    case "BLOCKED":
      return "status_blocked";
    case "WITHDRAWN":
      return "status_withdrawn";
    case "PURGED":
      return "status_purged";
  }
}

export function memberAdminLifecycleLabel(state: MemberAdminLifecycleState, lang: AppLanguageCode): string {
  return memberAdminCopy(memberAdminLifecycleCopyKey(state), lang);
}

/** Map internal lifecycle / origin codes → operator Korean (never expose raw enum). */
export function memberAdminLifecycleLabelKo(state: MemberAdminLifecycleState): string {
  return memberAdminLifecycleLabel(state, "ko");
}


export function findPlaceholderFinalCopy(text: string): string[] {
  const hay = String(text ?? "");
  return MEMBER_ADMIN_FORBIDDEN_PLACEHOLDER_FINAL_COPY.filter((term) => hay.includes(term));
}

export function containsForbiddenPrivilegeAxisLabel(text: string): boolean {
  return String(text ?? "").includes(MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL);
}
