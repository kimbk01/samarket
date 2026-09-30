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
} as const;

export type MemberAdminCopyKey = keyof typeof MEMBER_ADMIN_COPY;

/** Developer / schema terms that must never appear on operator UI surfaces covered by P1. */
export const MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS = [
  "ADMIN_MANUAL",
  "STORE_OWNER",
  "profiles",
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
