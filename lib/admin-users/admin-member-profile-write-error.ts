/**
 * 관리자 회원 생성·수정 — 프로필 저장 중복 오류 판정 단일 정의 (전체 감사 B3).
 * 예전: 모든 `duplicate key` 를 「닉네임 중복」으로 보여 전화·아이디 중복을 알 수 없었다.
 * 어떤 고유 제약인지는 **제약 이름으로만** 판정한다 — 모르면 null(일반 실패 문구).
 */
export type AdminProfileDuplicateKind = "phone" | "username" | "nickname";

export function classifyAdminProfileDuplicate(message: string | null | undefined): AdminProfileDuplicateKind | null {
  const lower = String(message ?? "").toLowerCase();
  if (lower.includes("profiles_phone_unique_idx")) return "phone";
  if (lower.includes("profiles_username_lower_unique_idx")) return "username";
  if (lower.includes("profiles_nickname_lower_unique_idx") || (lower.includes("unique") && lower.includes("nickname"))) {
    return "nickname";
  }
  return null;
}

/** 수정 API 오류 코드 — 화면(`EditMemberForm`·인증 관리 창)이 코드로 문구를 고른다 */
export const ADMIN_PROFILE_DUPLICATE_ERROR_CODE: Record<AdminProfileDuplicateKind, string> = {
  phone: "phone_taken",
  username: "username_taken",
  nickname: "nickname_taken",
};

/** 생성 API 칸·문구 키 */
export const ADMIN_PROFILE_DUPLICATE_FIELD: Record<
  AdminProfileDuplicateKind,
  { field: "contactPhone" | "username" | "nickname"; errorKey: string }
> = {
  phone: { field: "contactPhone", errorKey: "admin_users_err_phone_taken" },
  username: { field: "username", errorKey: "admin_users_err_username_taken" },
  nickname: { field: "nickname", errorKey: "admin_users_err_nickname_taken" },
};
