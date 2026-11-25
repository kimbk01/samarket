/**
 * 관리자 회원 생성·수정 — 프로필 저장 중복 오류 판정 단일 정의 (전체 감사 B3 · 등록 후속 감사 8번).
 * 예전: 모든 `duplicate key` 를 「닉네임 중복」으로 보여 전화·아이디 중복을 알 수 없었다.
 * 어떤 고유 제약인지는 **제약 이름으로만** 판정한다. 알 수 없는 고유 제약 위반은 `other`(일반 「중복 값」 문구),
 * 고유 제약 위반이 아니면 null — 호출부는 DB 원문을 화면에 내보내지 않고 일반 실패 코드로 답한다.
 */
export type AdminProfileDuplicateKind = "phone" | "username" | "nickname" | "dibay_id" | "other";

function isUniqueViolation(lower: string, code: string): boolean {
  return code === "23505" || lower.includes("duplicate key value") || lower.includes("23505");
}

export function classifyAdminProfileDuplicate(
  message: string | null | undefined,
  code?: string | null,
): AdminProfileDuplicateKind | null {
  const lower = String(message ?? "").toLowerCase();
  const pgCode = String(code ?? "").trim();
  if (lower.includes("profiles_phone_unique_idx")) return "phone";
  if (lower.includes("profiles_username_lower_unique_idx")) return "username";
  if (lower.includes("profiles_nickname_lower_unique_idx") || (lower.includes("unique") && lower.includes("nickname"))) {
    return "nickname";
  }
  /** `profiles_dibay_id_lower_unique_idx`·`profiles_dibay_id_key_unique_idx`·`profiles_dibay_id_initial_key_unique_idx` — 형식 검사(`_format_check`)는 제외 */
  if (lower.includes("profiles_dibay_id_") && lower.includes("unique")) return "dibay_id";
  if (isUniqueViolation(lower, pgCode)) return "other";
  return null;
}

/** 수정 API 오류 코드 — 화면(`EditMemberForm`·인증 관리 창)이 코드로 문구를 고른다 */
export const ADMIN_PROFILE_DUPLICATE_ERROR_CODE: Record<AdminProfileDuplicateKind, string> = {
  phone: "phone_taken",
  username: "username_taken",
  nickname: "nickname_taken",
  dibay_id: "dibay_id_taken",
  other: "duplicate_value",
};

/** 생성 API 칸·문구 키 */
export const ADMIN_PROFILE_DUPLICATE_FIELD: Record<
  AdminProfileDuplicateKind,
  { field: "contactPhone" | "username" | "nickname" | "form"; errorKey: string }
> = {
  phone: { field: "contactPhone", errorKey: "admin_users_err_phone_taken" },
  username: { field: "username", errorKey: "admin_users_err_username_taken" },
  nickname: { field: "nickname", errorKey: "admin_users_err_nickname_taken" },
  dibay_id: { field: "form", errorKey: "admin_users_member_dibay_id_taken" },
  other: { field: "form", errorKey: "admin_users_err_duplicate_value" },
};
