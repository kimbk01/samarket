/**
 * 모임 RPC 오류 코드 — DB 함수가 `raise exception 'moim_*'` 로 내는 값 전부.
 * 화면 문구는 M3 에서 i18n 키(`moim_err_<code>`)로 연결한다. 계약 테스트가 SQL 과 대조한다.
 */
export const MOIM_ERROR_CODES = [
  "moim_actor_invalid",
  "moim_address_city_unresolved",
  "moim_address_required",
  "moim_admin_reason_required",
  "moim_age_not_allowed",
  "moim_age_range_invalid",
  "moim_album_not_found",
  "moim_already_member",
  "moim_already_pending",
  "moim_attendance_invalid",
  "moim_ban_admin_only",
  "moim_ban_not_found",
  "moim_banned_word",
  "moim_birth_date_required",
  "moim_blocked",
  "moim_board_limit",
  "moim_board_name_invalid",
  "moim_board_not_found",
  "moim_board_order_invalid",
  "moim_board_system_fixed",
  "moim_cannot_target_host",
  "moim_cannot_target_self",
  "moim_capacity_invalid",
  "moim_category_invalid",
  "moim_category_label_invalid",
  "moim_category_slug_invalid",
  "moim_category_slug_taken",
  "moim_closed",
  "moim_comment_invalid",
  "moim_comment_not_found",
  "moim_confirm_name_mismatch",
  "moim_conflict",
  "moim_content_action_invalid",
  "moim_content_author_deleted",
  "moim_content_not_found",
  "moim_create_limit",
  "moim_deleted",
  "moim_duplicate",
  "moim_forbidden",
  "moim_full",
  "moim_host_must_transfer",
  "moim_host_recently_active",
  "moim_image_url_invalid",
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
  "moim_pin_limit",
  "moim_pin_notice_only",
  "moim_policy_invalid",
  "moim_policy_report_reason_none_active",
  "moim_policy_report_reason_removed",
  "moim_post_body_required",
  "moim_post_images_invalid",
  "moim_post_not_found",
  "moim_post_too_long",
  "moim_questions_too_many",
  "moim_region_invalid",
  "moim_region_required",
  "moim_reminder_window_invalid",
  "moim_report_decision_invalid",
  "moim_report_duplicate",
  "moim_report_link_invalid",
  "moim_report_not_found",
  "moim_report_reason_invalid",
  "moim_report_target_invalid",
  "moim_request_not_found",
  "moim_role_invalid",
  "moim_role_limit",
  "moim_room_create_requires_moim",
  "moim_room_membership_managed_by_moim",
  "moim_room_not_moim",
  "moim_room_owner_immutable",
  "moim_room_settings_managed_by_moim",
  "moim_sanction_already_active",
  "moim_sanction_level_invalid",
  "moim_sanction_not_found",
  "moim_sanction_not_revocable",
  "moim_sanction_period_invalid",
  "moim_sanction_period_not_allowed",
  "moim_schedule_already_joined",
  "moim_schedule_closed",
  "moim_schedule_finished",
  "moim_schedule_host_cannot_leave",
  "moim_schedule_motivation_required",
  "moim_schedule_not_found",
  "moim_schedule_not_joined",
  "moim_schedule_not_started",
  "moim_schedule_pending_requests",
  "moim_schedule_request_not_found",
  "moim_schedule_started",
  "moim_schedule_time_invalid",
  "moim_schedule_title_invalid",
  "moim_schedule_too_long",
  "moim_target_not_member",
  "moim_topic_length",
  "moim_topic_matches_category",
  "moim_topic_required",
  "moim_transfer_blocked_by_warning",
  "moim_transfer_co_host_full",
  "moim_transfer_not_found",
  "moim_transfer_pending",
  "moim_transfer_stale",
  "moim_user_restrict_failed",
  "moim_visibility_invalid",
] as const;

/**
 * DB 함수가 아니라 모임 API 라우트가 직접 내는 코드 (계약 시험은 SQL 코드 = MOIM_ERROR_CODES 만 대조).
 * - moim_invite_not_allowed: 받는 사람이 나를 메신저에서 차단함 (설계 P4 · 2026-11-27 감사 B4) — 차단 사실은 문구에 드러내지 않는다
 */
export const MOIM_ROUTE_ERROR_CODES = [
  "moim_invite_not_allowed",
  /** R5 E20: DB 제약·형 변환 오류(23514·23502·23503·22P02·22003·22007·22008)를 이 코드로 (응답 400) */
  "moim_invalid_input",
  /** R5 B11: 가입 질문 답이 1000자를 넘음 (가입·초대 수락 라우트, 400) */
  "moim_join_answer_too_long",
  /** R5 A §2-1: 모임 방 판정 API 가 DB 를 읽지 못함 (503 — 화면에 문구를 띄우지 않는다) */
  "moim_rooms_unavailable",
  /** R5 D5: 메신저 어드민이 모임 방에 차단·보관·읽기 전용을 하려 함 (메신저 어드민 가드, 422) */
  "moim_room_managed_by_moim",
] as const;

export type MoimErrorCode = (typeof MOIM_ERROR_CODES)[number] | (typeof MOIM_ROUTE_ERROR_CODES)[number] | "moim_unknown";

const CODE_SET: ReadonlySet<string> = new Set<string>([...MOIM_ERROR_CODES, ...MOIM_ROUTE_ERROR_CODES]);

/** Supabase RPC 오류 메시지에서 모임 오류 코드를 꺼낸다 */
export function toMoimErrorCode(message: unknown): MoimErrorCode {
  const text = typeof message === "string" ? message : "";
  const match = text.match(/moim_[a-z_]+/);
  if (match && CODE_SET.has(match[0])) return match[0] as MoimErrorCode;
  return "moim_unknown";
}

/**
 * R5 E20: RPC 오류 → 모임 코드. 메시지에 `moim_*` 코드가 있으면 그것, 없으면 Postgres 오류 번호로 —
 * 제약·형 변환 = moim_invalid_input(400) · 고유 위반 = moim_duplicate(409) · 직렬화·교착·잠금 = moim_conflict(409) · 그 밖 = moim_unknown(500).
 * 원래 메시지는 응답에 넣지 않는다(서버 로그 `detail` 만).
 */
const PG_INVALID_INPUT = new Set(["23514", "23502", "23503", "22P02", "22003", "22007", "22008"]);
const PG_CONFLICT = new Set(["40001", "40P01", "55P03"]);

export function moimErrorFromRpcError(error: { message?: unknown; code?: unknown } | null | undefined): MoimErrorCode {
  const byMessage = toMoimErrorCode(error?.message);
  if (byMessage !== "moim_unknown") return byMessage;
  const code = typeof error?.code === "string" ? error.code : "";
  if (PG_INVALID_INPUT.has(code)) return "moim_invalid_input";
  if (code === "23505") return "moim_duplicate";
  if (PG_CONFLICT.has(code)) return "moim_conflict";
  return "moim_unknown";
}
