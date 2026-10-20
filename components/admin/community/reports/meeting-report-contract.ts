/**
 * 모임 신고 Admin 화면 계약 (서버 페이지 · 클라이언트 공용, 순수 상수·타입).
 * 원장: meeting_reports — 피드 신고와 다른 원장.
 */
export type MeetingReportStatus = "pending" | "reviewing" | "resolved" | "rejected";
/** pending = 처리 대기(접수+검토 중) */
export const MEETING_REPORT_TABS = ["pending", "reviewing", "resolved", "rejected", "all"] as const;
export type MeetingReportTab = (typeof MEETING_REPORT_TABS)[number];

export const MEETING_REPORT_TARGET_OPTIONS = [
  "meeting",
  "member",
  "feed_post",
  "feed_comment",
  "chat_message",
  "album_item",
] as const;

export type MeetingReportAdminRow = {
  id: string;
  meeting_id: string | null;
  meeting_title: string | null;
  target_type: string;
  target_id: string;
  /** member 대상 = 회원 */
  target_member: { nickname: string | null; handle: string | null } | null;
  reporter_user_id: string;
  reporter: { nickname: string | null; handle: string | null } | null;
  reason_type: string;
  reason_detail: string | null;
  status: MeetingReportStatus;
  action_result: string | null;
  reviewed_by: string | null;
  reviewed_by_label: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type MeetingReportListResult = {
  ok: boolean;
  rows: MeetingReportAdminRow[];
  total: number;
  counts: Record<MeetingReportTab, number> | null;
  /** ok=false 일 때 오류 코드 (DB 오류 코드 또는 load_failed) */
  error?: string;
};

export type MeetingReportFilters = {
  tab: MeetingReportTab;
  type: string;
  q: string;
  periodError: string | null;
};
