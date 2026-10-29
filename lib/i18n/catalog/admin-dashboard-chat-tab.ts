/**
 * 관리자 홈 대시보드 「채팅」 탭 (G-04 · Owner 승인 2026-10-30) — 지표 기간 칩·탭 접근 거부 문구.
 * 지표 라벨은 레지스트리(`lib/admin/metrics/registry.ts` ← `chat-metrics.ts`)가 준다. messages.ts 의 ko/en 맨 끝에서 spread 된다.
 */
export const adminDashboardChatTabMessages = {
  ko: {
    admin_dash_chat_period_24h: "24시간",
    admin_dash_chat_period_7d: "최근 7일",
    admin_dash_tab_denied_title: "이 탭을 볼 권한이 없습니다",
    admin_dash_tab_denied_desc: "채팅 관리 권한이 있는 관리자만 채팅 지표·신고 대기·통화 현황을 볼 수 있습니다.",
  },
  en: {
    admin_dash_chat_period_24h: "24h",
    admin_dash_chat_period_7d: "Last 7 days",
    admin_dash_tab_denied_title: "You don't have access to this tab",
    admin_dash_tab_denied_desc: "Only admins with chat management permission can see chat metrics, pending reports and call status.",
  },
} as const;
