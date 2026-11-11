/**
 * 필라이프 앱·어드민 내비게이션 경로 (Next `app` 라우트와 동일하게 유지).
 */
export const philifeAppPaths = {
  home: "/philife",
  write: "/philife/write",
  my: "/philife/my",
  /** 1) 거래 채팅 */
  chats: "/chats",
  post: (id: string) => `/philife/${encodeURIComponent(id)}`,
} as const;

export const philifeAdminPaths = {
  root: "/admin/philife",
  reports: "/admin/philife/reports",
  sections: "/admin/philife/sections",
  topics: "/admin/philife/topics",
  settings: "/admin/philife/settings",
} as const;
