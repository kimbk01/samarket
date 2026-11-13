import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type GroupRoomRole = "owner" | "admin" | "member";

export type GroupRoomDbType = "private_group" | "open_group";

export type GroupRoomListItem = {
  id: string;
  roomType: "private_group";
  title: string;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: CommunityMessengerRoomSummary["lastMessageType"];
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  ownerUserId: string | null;
};

export type CreateGroupRoomInput = {
  userId: string;
  title: string;
  memberIds: string[];
};

export type CreateGroupRoomResult =
  /**
   * `room: null` = 방·참여자는 저장됐으나 방 요약 조회만 실패(일부 성공). 화면은 서버 목록 재조회 후 그 방으로 이동한다
   * (실패로 돌려주면 다시 눌러 같은 방이 또 생김 — D15 2026-11-13).
   */
  | { ok: true; roomId: string; room: CommunityMessengerRoomSummary | null }
  | { ok: false; error: string; roomId?: string };

export type GroupRoomRow = {
  id: string;
  room_type: GroupRoomDbType | string;
  room_status: string | null;
  visibility: string | null;
  join_policy: string | null;
  is_readonly: boolean | null;
  created_by: string | null;
  owner_user_id: string | null;
  title: string | null;
  summary: string | null;
  avatar_url?: string | null;
  is_discoverable: boolean | null;
  allow_member_invite: boolean | null;
  notice_text: string | null;
  allow_admin_invite: boolean | null;
  allow_admin_kick: boolean | null;
  allow_admin_edit_notice: boolean | null;
  allow_member_upload: boolean | null;
  allow_member_call: boolean | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  /** Phase3 S2-4 soft-delete tombstone — orthogonal to room_status / viewer archive */
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type GroupParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: GroupRoomRole | string;
  unread_count: number | null;
  is_muted: boolean | null;
  is_pinned: boolean | null;
  left_at: string | null;
};

export type GroupRoomSettingsPatch = {
  title?: string;
  noticeText?: string;
  allowMemberInvite?: boolean;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
};
