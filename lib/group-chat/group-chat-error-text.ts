/**
 * 그룹채팅(레거시 `group_rooms`) 오류 코드 → 화면 문구 키 — 서버는 코드만 보낸다 (`docs/i18n-ssot.md` §3-3 ·
 * 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1).
 */
import type { ApiErrorCodeMap } from "@/lib/i18n/api-error-text";

export const GROUP_CHAT_API_ERROR_CODE_MAP: ApiErrorCodeMap = {
  room_id_required: "ui_group_chat_room_id_required",
  room_not_found: "ui_group_chat_room_not_found",
  group_chat_members_only: "ui_group_chat_members_only",
  group_chat_already_joined: "ui_group_chat_already_joined",
  before_message_not_found: "common_chat_room_load_failed",
  group_chat_load_failed: "common_chat_room_load_failed",
  server_config: "common_chat_room_load_failed",
  group_chat_room_create_failed: "ui_group_chat_create_failed",
  group_chat_message_required: "ui_group_chat_input_placeholder",
  group_chat_message_page_rate_limited: "common_api_too_many_requests",
  group_chat_message_rate_limited: "common_api_too_many_requests",
};
