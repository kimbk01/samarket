/**
 * 통합 채팅(`chat_rooms`, `chat_room_participants`) PostgREST select — API·관리자 공통.
 */

/** 사용자용 거래방 상세 — 불필요 컬럼 제외 */
export const CHAT_ROOM_ITEM_TRADE_API_SELECT =
  "id, room_type, item_id, context_type, seller_id, buyer_id, initiator_id, peer_id, request_status, trade_status, last_message_at, last_message_preview, is_blocked, is_locked, created_at, reopened_at";

export const CHAT_ROOM_PARTICIPANT_API_SELECT =
  "id, room_id, user_id, role_in_room, joined_at, left_at, is_active, hidden, muted, blocked_at, last_read_message_id, last_read_at, unread_count, reopen_count, created_at, updated_at";

/**
 * 관리자 채팅방 상세 — `ChatRoomRow` + 연동 FK (`lib/types/samarket-chat`).
 * 스키마에 없는 컬럼이 있으면 PostgREST 오류 → 마이그레이션으로 맞춤.
 */
export const CHAT_ROOM_ADMIN_DETAIL_SELECT =
  "id, room_type, item_id, context_type, seller_id, buyer_id, initiator_id, peer_id, related_post_id, related_group_id, related_business_id, meeting_id, request_status, trade_status, last_message_id, last_message_at, last_message_preview, is_blocked, blocked_by, blocked_at, is_locked, locked_by, locked_at, created_at, updated_at, reopened_at";

/** 관리자 채팅 이벤트 로그 */
export const CHAT_EVENT_LOGS_ADMIN_SELECT =
  "id, room_id, event_type, actor_user_id, metadata, created_at";

/** 통합 채팅 신고 `chat_reports` */
export const CHAT_REPORTS_ADMIN_SELECT =
  "id, room_id, message_id, item_id, report_type, reporter_user_id, reported_user_id, reason_type, reason_detail, status, priority, created_at, updated_at, assigned_admin_id";

/** 채팅 알림 전송 로그 */
export const NOTIFICATION_LOGS_ADMIN_SELECT =
  "id, room_id, user_id, notification_type, delivery_channel, status, payload_summary, created_at, updated_at";
