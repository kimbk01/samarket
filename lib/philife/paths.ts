/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  /**
   * 모임 목록·탐색 — Philife `category=meetup` 피드는 사용하지 않고
   * 메신저 `open_chat`(참여 중 + 모임 찾기)로만 진입한다.
   */
  meetingsFeed: "/community-messenger?section=open_chat",
  write: "/philife/write",
  /** 모임 만들기/찾기 — 메신저 오픈그룹·모임 찾기 시트 */
  writeMeeting: "/community-messenger?section=open_chat&open=public-group-find",
  my: "/philife/my",
  /** 1) 거래 채팅 */
  chats: "/chats",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  /** 모임 `meetingId` 딥링크 — 메신저 홈에서 방/게시글로 해석 */
  meeting: (id: string) =>
    `/community-messenger?section=open_chat&meetingId=${encodeURIComponent(id)}`,
  meetingGroupChat: (meetingId: string) =>
    `/community-messenger?section=open_chat&meetingId=${encodeURIComponent(meetingId)}`,
  meetingGroupChatRoom: (_meetingId: string, roomId: string) =>
    `/community-messenger/rooms/${encodeURIComponent(roomId)}`,
  meetingOpenChat: (meetingId: string) =>
    `/community-messenger?section=open_chat&meetingId=${encodeURIComponent(meetingId)}`,
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
