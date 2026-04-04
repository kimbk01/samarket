/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  write: "/philife/write",
  writeMeeting: "/philife/write?category=meetup",
  my: "/philife/my",
  /** 1) 거래 채팅 */
  chats: "/chats",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  meeting: (id: string) => `/philife/meetings/${encodeURIComponent(id)}`,
  /** 제거된 커뮤니티 채팅 경로는 모두 모임 상세로 되돌린다. */
  meetingGroupChat: (meetingId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}`,
  meetingGroupChatRoom: (meetingId: string, _roomId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}`,
  meetingOpenChat: (meetingId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}`,
  meetingOpenChatRoom: (meetingId: string, _roomId: string) =>
    `/philife/meetings/${encodeURIComponent(meetingId)}`,
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
