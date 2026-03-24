/**
 * 사마켓 당근형 통합 채팅 타입 (chat_rooms, chat_room_participants, chat_messages)
 *
 * --------------------------------------------------
 * 채팅 구조 (반드시 2가지로 분리)
 * --------------------------------------------------
 * 1) 거래 채팅 (item_trade)
 *    - 상품 상세 "채팅하기"로 시작, item_id 기반, 판매자/구매자, 상품 1개 = 채팅방 1개
 *    - 재사용: 같은 item + 같은 판매자/구매자 → 기존 방 사용
 *    - 나가기: participant.hidden=true, left_at 설정
 *    - 복구: hidden=false, left_at=null (다시 메시지 오면 자동 복구 또는 다시 채팅하기 시 reopen)
 *
 * 2) 일반 채팅 (general_chat)
 *    - 프로필/이웃/서비스/문의 등, 상품 무관, context 기반
 *    - 요청→승인 구조: request_status pending | approved | rejected
 *
 * --------------------------------------------------
 * 채팅방 상태: active | left | hidden | blocked | locked
 * 참여자 상태: active | left | hidden | blocked
 * 메시지: 물리 삭제 금지 — 사용자 삭제 시 개인만 숨김, 관리자 숨김 시 전체 숨김
 * --------------------------------------------------
 */

export type RoomType = "item_trade" | "general_chat";

export type RequestStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export type TradeStatus =
  | "inquiry"
  | "negotiating"
  | "reserved"
  | "appointment_set"
  | "completed"
  | "cancelled"
  | "dispute";

export type ContextType =
  | "neighborhood"
  | "group"
  | "job"
  | "real_estate"
  | "support"
  | "delivery"
  | "biz_profile"
  | "etc";

export type RoleInRoom = "seller" | "buyer" | "requester" | "responder" | "member";

export type ChatMessageType =
  | "text"
  | "image"
  | "item_card"
  | "system"
  | "appointment"
  | "call_log"
  | "safety_notice";

export interface ChatRoomRow {
  id: string;
  room_type: RoomType;
  item_id: string | null;
  context_type: ContextType | null;
  seller_id: string | null;
  buyer_id: string | null;
  initiator_id: string;
  peer_id: string | null;
  request_status: RequestStatus;
  trade_status: TradeStatus;
  last_message_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  is_blocked: boolean;
  blocked_by: string | null;
  blocked_at: string | null;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  reopened_at: string | null;
}

export interface ChatRoomParticipantRow {
  id: string;
  room_id: string;
  user_id: string;
  role_in_room: RoleInRoom;
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
  hidden: boolean;
  muted: boolean;
  blocked_at: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
  unread_count: number;
  reopen_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type: ChatMessageType;
  body: string;
  metadata: Record<string, unknown>;
  deleted_by_sender: boolean;
  deleted_for_me: string[];
  is_hidden_by_admin: boolean;
  hidden_reason: string | null;
  created_at: string;
  read_at: string | null;
}

export type ChatReportReasonType =
  | "abuse"
  | "spam"
  | "scam"
  | "sexual"
  | "hate"
  | "threat"
  | "no_show"
  | "impersonation"
  | "off_platform_payment"
  | "stalking"
  | "harassment"
  | "etc";

export type ChatReportStatus =
  | "received"
  | "triaging"
  | "actioned"
  | "dismissed"
  | "escalated";

export type AppointmentStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "done"
  | "no_show";
