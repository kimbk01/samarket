/**
 * Member Admin — Owner-facing Korean Copy SSOT (P1).
 * Operator surfaces must use human Korean. Internal codes stay in logs/system detail only.
 */

export const MEMBER_ADMIN_COPY = {
  member_management: "회원 관리",
  member_register: "회원 등록",
  edit_profile: "정보 수정",
  password_manage: "비밀번호 관리",
  password_change: "비밀번호 변경",
  password_temp_set_title: "새 임시 비밀번호 설정",
  password_temp_set_primary: "새 비밀번호 설정",
  password_temp_set_body:
    "현재 비밀번호는 확인할 수 없습니다. 새 임시 비밀번호를 설정하면 기존 비밀번호는 더 이상 사용할 수 없습니다.",
  password_new_label: "새 임시 비밀번호",
  password_new_confirm_label: "새 임시 비밀번호 확인",
  member_create_title: "회원 등록",
  member_edit_title: "정보 수정",
  store_ops: "매장 운영",
  admin_privilege: "관리 권한",
  status_active: "정상 이용",
  status_needs_review: "확인 필요",
  status_suspended: "이용 정지",
  status_unsuspend: "정지 해제",
  status_blocked: "이용 차단",
  status_unblock: "차단 해제",
  status_withdrawn: "탈퇴 완료",
  status_purged: "삭제됨",
  ops_history: "운영 이력",
  moderation: "신고·제재",
  warn: "경고 등록",
  cancel: "취소",
  confirm: "확인",
  save_changes: "변경사항 저장",
  continue_editing: "계속 수정",
  discard_changes: "변경사항 버리기",
  dirty_close_title: "작성 중인 변경사항이 있습니다.",
  dirty_close_description: "닫으시겠습니까?",
  privilege_member: "일반 회원",
  privilege_operator: "운영자",
  privilege_admin: "관리자",
  privilege_super_admin: "최고 관리자",
  origin_admin_manual: "관리자 생성",
  origin_user_signup: "일반 가입",
  origin_kakao: "카카오 가입",
  store_operator: "매장 운영자",
  system_member_key: "시스템 회원키",
  mutation_failed: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  loading: "처리 중…",
  dibay_id_change: "@회원 ID 변경",
  dibay_id_change_title: "@회원 ID 변경",
  dibay_id_current_label: "현재 @회원 ID",
  dibay_id_new_label: "새 @회원 ID",
  dibay_id_change_primary: "변경",
  dibay_id_change_body: "공개 @회원 ID를 변경합니다. 이미 사용 중이거나 허용되지 않는 값은 사용할 수 없습니다.",
  verify_manage: "인증 관리",
  verify_manage_title: "인증 관리",
  verify_phone_label: "전화번호",
  verify_status_label: "전화 인증 상태",
  verify_status_done: "인증 완료",
  verify_status_pending: "인증 미완료",
  verify_approve: "인증 승인",
  verify_reset: "인증 초기화",
  verify_approve_confirm_title: "전화 인증을 승인할까요?",
  verify_approve_confirm_body: "선택한 회원의 전화 인증을 완료 상태로 변경합니다.",
  verify_reset_confirm_title: "전화 인증을 초기화할까요?",
  verify_reset_confirm_body: "전화 인증이 미완료 상태로 돌아가며, 다시 인증이 필요합니다.",
  verify_save_phone: "전화번호 저장",
  verify_no_phone_for_approve: "인증 승인 전에 전화번호를 먼저 저장해 주세요.",
  store_relation_manage: "관계 관리",
  store_relation_title: "매장 운영 관계",
  privilege_promote: "관리자 권한 부여",
  privilege_revoke: "관리자 권한 해제",
  privilege_cannot_change: "권한을 변경할 수 없습니다",
  privilege_cannot_change_self: "자신의 권한은 변경할 수 없습니다",
} as const;

export type MemberAdminCopyKey = keyof typeof MEMBER_ADMIN_COPY;

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

export function memberAdminCopy(key: MemberAdminCopyKey): string {
  return MEMBER_ADMIN_COPY[key];
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

/** Map internal lifecycle / origin codes → operator Korean (never expose raw enum). */
export function memberAdminLifecycleLabelKo(
  state: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "WITHDRAWN" | "PURGED" | "NEEDS_REVIEW",
): string {
  switch (state) {
    case "ACTIVE":
      return MEMBER_ADMIN_COPY.status_active;
    case "NEEDS_REVIEW":
      return MEMBER_ADMIN_COPY.status_needs_review;
    case "SUSPENDED":
      return MEMBER_ADMIN_COPY.status_suspended;
    case "BLOCKED":
      return MEMBER_ADMIN_COPY.status_blocked;
    case "WITHDRAWN":
      return MEMBER_ADMIN_COPY.status_withdrawn;
    case "PURGED":
      return MEMBER_ADMIN_COPY.status_purged;
  }
}


export function findPlaceholderFinalCopy(text: string): string[] {
  const hay = String(text ?? "");
  return MEMBER_ADMIN_FORBIDDEN_PLACEHOLDER_FINAL_COPY.filter((term) => hay.includes(term));
}

export function containsForbiddenPrivilegeAxisLabel(text: string): boolean {
  return String(text ?? "").includes(MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL);
}
