/** DIBAY CM private group room — stable API error codes (P0). */
export const GROUP_ROOM_ERROR = {
  MEMBERS_REQUIRED: "members_required",
  TITLE_REQUIRED: "title_required",
  BLOCKED_TARGET: "blocked_target",
  FRIEND_REQUIRED: "friend_required",
  INVALID_TARGET: "invalid_target",
  NOT_GROUP_ROOM: "not_group_room",
  ROOM_NOT_FOUND: "room_not_found",
  ROOM_UNAVAILABLE: "room_unavailable",
  FORBIDDEN: "forbidden",
  BAD_TARGET: "bad_target",
  TARGET_NOT_FOUND: "target_not_found",
  OWNER_CANNOT_LEAVE: "owner_cannot_leave",
  GROUP_CREATE_FAILED: "group_create_failed",
  GROUP_PARTICIPANT_CREATE_FAILED: "group_participant_create_failed",
  INVITE_FAILED: "invite_failed",
  KICK_FAILED: "kick_failed",
  LEAVE_FAILED: "leave_failed",
  UPDATE_FAILED: "update_failed",
  MESSENGER_MIGRATION_REQUIRED: "messenger_migration_required",
  CONTENT_REQUIRED: "content_required",
  MARK_READ_UNAVAILABLE: "mark_read_unavailable",
} as const;

export type GroupRoomErrorCode = (typeof GROUP_ROOM_ERROR)[keyof typeof GROUP_ROOM_ERROR];
