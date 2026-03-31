/**
 * 모임 LINE형 오픈채팅 전용 타입.
 * DB: meeting_open_chat_* 테이블. chat_rooms / community_chat_* / 필라이프 open_chat_rooms 와 무관.
 */

export type MeetingOpenChatJoinType = "free" | "password" | "approval" | "password_approval";

export type MeetingOpenChatMemberRole = "owner" | "sub_admin" | "member";

export type MeetingOpenChatMemberStatus = "active" | "pending" | "left" | "kicked" | "banned";

export type MeetingOpenChatMessageType = "text" | "image" | "file" | "notice" | "system" | "reply";

export type MeetingOpenChatJoinRequestStatus = "pending" | "approved" | "rejected";

export type MeetingOpenChatReportStatus = "pending" | "reviewed" | "actioned" | "rejected";

export type MeetingOpenChatAttachmentFileType = "image" | "file";

/** DB `meeting_open_chat_rooms` */
export type MeetingOpenChatRoomRow = {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  join_type: MeetingOpenChatJoinType;
  password_hash: string | null;
  max_members: number;
  is_active: boolean;
  is_searchable: boolean;
  allow_rejoin_after_kick: boolean;
  owner_user_id: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  active_member_count: number;
  pending_join_count: number;
  created_at: string;
  updated_at: string;
};

export type MeetingOpenChatRoomPublic = Omit<MeetingOpenChatRoomRow, "password_hash"> & {
  has_password: boolean;
};

/** 목록 API: 방 메타 + 현재 사용자 기준 미입장·안 읽음 */
export type MeetingOpenChatRoomListEntry = MeetingOpenChatRoomPublic & {
  viewerUnreadCount: number;
  viewerIsChatMember: boolean;
};

export type MeetingOpenChatMemberRow = {
  id: string;
  room_id: string;
  user_id: string;
  open_nickname: string;
  open_profile_image_url: string | null;
  intro_message: string;
  role: MeetingOpenChatMemberRole;
  status: MeetingOpenChatMemberStatus;
  joined_at: string;
  last_seen_at: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
  muted_until: string | null;
  kicked_at: string | null;
  banned_at: string | null;
  updated_at: string;
};

export type MeetingOpenChatMessageRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  member_id: string | null;
  message_type: MeetingOpenChatMessageType;
  content: string;
  reply_to_message_id: string | null;
  is_blinded: boolean;
  blinded_reason: string | null;
  blinded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** 메시지에 붙은 첨부(이미지 등). 목록 API에서 함께 내려줌 */
export type MeetingOpenChatAttachmentPublic = {
  id: string;
  fileType: MeetingOpenChatAttachmentFileType;
  fileUrl: string;
  fileName: string | null;
  fileSize: number | null;
};

export type MeetingOpenChatMessagePublic = MeetingOpenChatMessageRow & {
  /** 활성 멤버·운영자용 표시용 닉네임(시스템은 null) */
  sender_open_nickname: string | null;
  attachments: MeetingOpenChatAttachmentPublic[];
};

export type MeetingOpenChatMemberAccess = {
  memberId: string;
  role: MeetingOpenChatMemberRole;
  open_nickname: string;
  open_profile_image_url: string | null;
};

/** 참여자 목록·프로필 미리보기 API용 (실명·전화 없음) */
export type MeetingOpenChatParticipantPublic = {
  memberId: string;
  openNickname: string;
  openProfileImageUrl: string | null;
  introMessage: string;
  role: MeetingOpenChatMemberRole;
  joinedAt: string;
  lastSeenAt: string | null;
};

export type MeetingOpenChatReportReason =
  | "spam"
  | "abuse"
  | "sexual"
  | "illegal"
  | "harassment"
  | "impersonation"
  | "advertisement"
  | "other";

export type MeetingOpenChatJoinRequestListItem = {
  id: string;
  openNickname: string;
  introMessage: string;
  createdAt: string;
};

export type MeetingOpenChatReportListItem = {
  id: string;
  reportReason: string;
  reportDetail: string;
  targetOpenNickname: string | null;
  messageId: string | null;
  createdAt: string;
};

export type MeetingOpenChatBanListItem = {
  id: string;
  targetOpenNickname: string | null;
  reason: string;
  bannedAt: string;
};

export type MeetingOpenChatNoticePublic = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
};
