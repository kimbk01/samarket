/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  /** 커뮤니티 모임 목록(Philife 피드 `meetup` 칩과 동일 쿼리) */
  meetingsFeed: "/philife?category=meetup",
  write: "/philife/write",
  writeMeeting: "/philife/write?category=meetup",
  my: "/philife/my",
  /** 1) 거래 채팅 */
  chats: "/chats",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  /** 모임: Philife 모임 피드 + 선택 `meetingId`(딥링크는 피드에서 방으로 이어짐). */
  meeting: (id: string) => `/philife?category=meetup&meetingId=${encodeURIComponent(id)}`,
  meetingGroupChat: (meetingId: string) =>
    `/philife?category=meetup&meetingId=${encodeURIComponent(meetingId)}`,
  meetingGroupChatRoom: (_meetingId: string, roomId: string) =>
    `/community-messenger/rooms/${encodeURIComponent(roomId)}`,
  meetingOpenChat: (meetingId: string) =>
    `/philife?category=meetup&meetingId=${encodeURIComponent(meetingId)}`,
  meetingOpenChatRoom: (_meetingId: string, roomId: string) =>
    `/community-messenger/rooms/${encodeURIComponent(roomId)}`,
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
