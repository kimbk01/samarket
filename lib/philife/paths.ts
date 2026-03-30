/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  openChat: "/philife/open-chat",
  openChatCreate: "/philife/open-chat/create",
  openChatRoom: (id: string) => `/philife/open-chat/${encodeURIComponent(id)}`,
  openChatInvite: (id: string, inviteCode: string) =>
    `/philife/open-chat/${encodeURIComponent(id)}?inviteCode=${encodeURIComponent(inviteCode)}`,
  write: "/philife/write",
  writeMeeting: "/philife/write?category=meetup",
  my: "/philife/my",
  chats: "/chats/philife?tab=inbox",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
  meeting: (id: string) => `/philife/meetings/${encodeURIComponent(id)}`,
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
