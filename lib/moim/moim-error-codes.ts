/**
 * 모임 RPC 오류 코드 — DB 함수가 `raise exception 'moim_*'` 로 내는 값 전부.
 * 화면 문구는 M3 에서 i18n 키(`moim_err_<code>`)로 연결한다. 계약 테스트가 SQL 과 대조한다.
 */
export const MOIM_ERROR_CODES = [
  "moim_actor_invalid",
  "moim_address_required",
  "moim_age_not_allowed",
  "moim_already_member",
  "moim_already_pending",
  "moim_ban_not_found",
  "moim_banned_word",
  "moim_birth_date_required",
  "moim_blocked",
  "moim_cannot_target_self",
  "moim_capacity_invalid",
  "moim_category_invalid",
  "moim_confirm_name_mismatch",
  "moim_conflict",
  "moim_create_limit",
  "moim_duplicate",
  "moim_forbidden",
  "moim_full",
  "moim_host_must_transfer",
  "moim_intro_length",
  "moim_invite_expiry_invalid",
  "moim_invite_not_found",
  "moim_invite_too_soon",
  "moim_join_mode_invalid",
  "moim_join_not_allowed",
  "moim_name_length",
  "moim_nickname_invalid",
  "moim_nickname_required",
  "moim_not_found",
  "moim_not_member",
  "moim_permission_not_adjustable",
  "moim_permission_value_invalid",
  "moim_phone_verification_required",
  "moim_questions_too_many",
  "moim_request_not_found",
  "moim_role_invalid",
  "moim_role_limit",
  "moim_room_create_requires_moim",
  "moim_room_membership_managed_by_moim",
  "moim_room_owner_immutable",
  "moim_room_settings_managed_by_moim",
  "moim_target_not_member",
  "moim_transfer_blocked_by_warning",
  "moim_transfer_not_found",
  "moim_transfer_stale",
] as const;

export type MoimErrorCode = (typeof MOIM_ERROR_CODES)[number] | "moim_unknown";

const CODE_SET: ReadonlySet<string> = new Set(MOIM_ERROR_CODES);

/** Supabase RPC 오류 메시지에서 모임 오류 코드를 꺼낸다 */
export function toMoimErrorCode(message: unknown): MoimErrorCode {
  const text = typeof message === "string" ? message : "";
  const match = text.match(/moim_[a-z_]+/);
  if (match && CODE_SET.has(match[0])) return match[0] as MoimErrorCode;
  return "moim_unknown";
}
