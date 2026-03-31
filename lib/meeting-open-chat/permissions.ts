import type { MeetingOpenChatMemberRole } from "./types";

export function meetingOpenChatRoleCanManage(role: MeetingOpenChatMemberRole): boolean {
  return role === "owner" || role === "sub_admin";
}

export function meetingOpenChatRoleCanEditRoomSettings(role: MeetingOpenChatMemberRole): boolean {
  return role === "owner";
}

export function meetingOpenChatRoleCanAssignSubAdmin(role: MeetingOpenChatMemberRole): boolean {
  return role === "owner";
}
