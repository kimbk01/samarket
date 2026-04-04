/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  write: "/philife/write",
  writeMeeting: "/philife/write?category=meetup",
  my: "/philife/my",
  /** 1) 거래 채팅 */
  chats: "/chats/philife?tab=inbox",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  meeting: (id: string) => `/philife/meetings/${encodeURIComponent(id)}`,
  /** 2) 커뮤니티 모임 그룹 채팅 (`meeting_open_chat_*` UI 진입) */
  meetingGroupChat: (meetingId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}/group-chat`,
  meetingGroupChatRoom: (meetingId: string, roomId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}/group-chat/${encodeURIComponent(roomId)}`,
  /** @deprecated 레거시 URL — 서버 리다이렉트로 `meetingGroupChat*` 로 이어짐 */
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
