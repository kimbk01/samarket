/**
 * 커뮤니티 모임 전용 오픈채팅 엔진 타입.
 * DB: community_chat_* 테이블. 거래/매장/필라이프 open_chat(chat_rooms)과 무관.
 */

export type CommunityChatJoinType = "public" | "password" | "approval";

export type CommunityChatRoomStatus = "active" | "closed" | "archived";

export type CommunityChatMemberRole = "owner" | "sub_admin" | "member";

export type CommunityChatMemberStatus = "joined" | "left" | "kicked";

export type CommunityChatMessageType = "text" | "image" | "file" | "notice" | "system" | "reply";

export type CommunityChatReportCategory =
  | "spam"
  | "abuse"
  | "sexual"
  | "illegal"
  | "advertisement"
  | "impersonation"
  | "harassment"
  | "other";

export type CommunityChatReportStatus =
  | "pending"
  | "dismissed"
  | "action_blind"
  | "action_kick"
  | "action_ban";

export type CommunityChatJoinRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export type CommunityChatAttachmentKind = "image" | "file";

/** DB `community_chat_rooms` 행 (서버 응답용) */
export type CommunityChatRoomRow = {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  join_type: CommunityChatJoinType;
  /** 클라이언트에 절대 반환하지 않음 — 서버 검증 전용 */
  password_hash: string | null;
  max_members: number;
  is_searchable: boolean;
  status: CommunityChatRoomStatus;
  owner_user_id: string;
  report_threshold: number | null;
  joined_count: number;
  pending_join_count: number;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

/** API/클라이언트용 방 요약 (비밀번호 해시 제외) */
export type CommunityChatRoomPublic = Omit<CommunityChatRoomRow, "password_hash"> & {
  join_type: CommunityChatJoinType;
  has_password: boolean;
};

export type CommunityChatRoomMemberRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: CommunityChatMemberRole;
  nickname: string;
  avatar_url: string | null;
  member_status: CommunityChatMemberStatus;
  last_read_message_id: string | null;
  last_read_at: string | null;
  joined_at: string;
  left_at: string | null;
  kicked_at: string | null;
  kicked_by: string | null;
  updated_at: string;
};

export type CommunityChatMessageRow = {
  id: string;
  room_id: string;
  sender_user_id: string | null;
  message_type: CommunityChatMessageType;
  body: string;
  reply_to_message_id: string | null;
  related_notice_id: string | null;
  metadata: Record<string, unknown>;
  is_blinded: boolean;
  blind_reason: string | null;
  blinded_by: string | null;
  blinded_at: string | null;
  deleted_at: string | null;
  deleted_by_sender_at: string | null;
  created_at: string;
};

export type CommunityChatMessageAttachmentRow = {
  id: string;
  message_id: string;
  kind: CommunityChatAttachmentKind;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  sort_order: number;
  created_at: string;
};

export type CommunityChatReportRow = {
  id: string;
  room_id: string;
  message_id: string;
  reporter_user_id: string;
  category: CommunityChatReportCategory;
  detail: string;
  status: CommunityChatReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityChatBanRow = {
  id: string;
  room_id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  ban_until: string | null;
  created_at: string;
  released_at: string | null;
  released_by: string | null;
};

export type CommunityChatNoticeRow = {
  id: string;
  room_id: string;
  author_user_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  pin_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CommunityChatJoinRequestRow = {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  request_message: string;
  status: CommunityChatJoinRequestStatus;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityChatLogActionType =
  | "room_created"
  | "room_updated"
  | "room_closed"
  | "member_joined"
  | "join_request_submitted"
  | "member_left"
  | "member_kicked"
  | "member_banned"
  | "member_unbanned"
  | "role_changed"
  | "join_approved"
  | "join_rejected"
  | "message_blinded"
  | "message_deleted"
  | "notice_created"
  | "notice_updated"
  | "notice_deleted"
  | "report_received"
  | "report_resolved"
  | "sub_admin_granted"
  | "sub_admin_revoked";

export type CommunityChatLogRow = {
  id: string;
  room_id: string;
  actor_user_id: string | null;
  action_type: CommunityChatLogActionType | string;
  target_user_id: string | null;
  target_message_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

/** 방 생성 요청 바디 (서버 검증 스키마와 맞출 것) */
export type CreateCommunityChatRoomInput = {
  meetingId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  joinType: CommunityChatJoinType;
  /** joinType=password 일 때 평문. 서버에서 해시만 저장 */
  joinPassword?: string;
  maxMembers: number;
  isSearchable: boolean;
  reportThreshold?: number | null;
};

/** 입장 시 방별 프로필 */
export type CommunityChatMemberProfileInput = {
  nickname: string;
  avatarUrl?: string | null;
};
