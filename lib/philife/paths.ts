/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  /** 1) 공개 필라이프 오픈채팅 */
  openChat: "/philife/open-chat",
  /** @deprecated 북마크용 — 실제 생성은 `writeMeeting` */
  openChatCreate: "/philife/open-chat/create",
  openChatRoom: (id: string) => `/philife/open-chat/${encodeURIComponent(id)}`,
  openChatInvite: (id: string, inviteCode: string) =>
    `/philife/open-chat/${encodeURIComponent(id)}?inviteCode=${encodeURIComponent(inviteCode)}`,
  write: "/philife/write",
  writeMeeting: "/philife/write?category=meetup",
  my: "/philife/my",
  /** 2) 거래 채팅 */
  chats: "/chats/philife?tab=inbox",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  meeting: (id: string) => `/philife/meetings/${encodeURIComponent(id)}`,
  /** 3) 커뮤니티 모임 단톡방 (`meeting_open_chat_*`) */
  meetingOpenChat: (meetingId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat`,
  meetingOpenChatRoom: (meetingId: string, roomId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/${encodeURIComponent(roomId)}`,
} as const;

export const philifeAdminPaths = {
  root: "/admin/philife",
  meetings: "/admin/philife/meetings",
  meetingEvents: "/admin/philife/meeting-events",
  reports: "/admin/philife/reports",
  sections: "/admin/philife/sections",
  topics: "/admin/philife/topics",
  settings: "/admin/philife/settings",
} as const;
