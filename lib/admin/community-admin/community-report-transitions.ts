/**
 * 커뮤니티 신고·모임 신고 상태 전이표 (설계 §C-0-3 · E-5 · G-6). 클라이언트·서버 공용 (상수·순수 함수만).
 * - 피드 신고: PATCH 는 검토 시작(open→reviewing)·메모·재오픈(최고 관리자)만. 인정/기각은 decision 엔드포인트.
 * - 모임 신고: pending→reviewing, pending|reviewing→resolved|rejected, 재오픈은 최고 관리자.
 */

export const COMMUNITY_REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type CommunityReportStatus = (typeof COMMUNITY_REPORT_STATUSES)[number];

export function isCommunityReportStatus(v: unknown): v is CommunityReportStatus {
  return typeof v === "string" && (COMMUNITY_REPORT_STATUSES as readonly string[]).includes(v);
}

export type ReportPatchTransition =
  | { ok: true; kind: "review" | "reopen" }
  | { ok: false; error: "use_decision_endpoint" | "invalid_transition" | "reopen_super_admin_only" };

/** PATCH 로 허용되는 상태 전이 (같은 상태 = 전이 없음, 호출 전에 걸러낸다) */
export function resolveCommunityReportPatchTransition(
  from: CommunityReportStatus,
  to: CommunityReportStatus,
  isSuperAdmin: boolean
): ReportPatchTransition {
  if (to === "resolved" || to === "dismissed") return { ok: false, error: "use_decision_endpoint" };
  if (from === "open" && to === "reviewing") return { ok: true, kind: "review" };
  if ((from === "resolved" || from === "dismissed") && to === "open") {
    return isSuperAdmin ? { ok: true, kind: "reopen" } : { ok: false, error: "reopen_super_admin_only" };
  }
  return { ok: false, error: "invalid_transition" };
}

export const MEETING_REPORT_STATUSES = ["pending", "reviewing", "resolved", "rejected"] as const;
export type MeetingReportStatus = (typeof MEETING_REPORT_STATUSES)[number];

export function isMeetingReportStatus(v: unknown): v is MeetingReportStatus {
  return typeof v === "string" && (MEETING_REPORT_STATUSES as readonly string[]).includes(v);
}

export type MeetingReportTransition =
  | { ok: true; kind: "review" | "decide" | "reopen"; reasonRequired: boolean }
  | { ok: false; error: "invalid_transition" | "reopen_super_admin_only" };

export function resolveMeetingReportTransition(
  from: MeetingReportStatus,
  to: MeetingReportStatus,
  isSuperAdmin: boolean
): MeetingReportTransition {
  if (from === "pending" && to === "reviewing") return { ok: true, kind: "review", reasonRequired: false };
  if ((from === "pending" || from === "reviewing") && (to === "resolved" || to === "rejected")) {
    return { ok: true, kind: "decide", reasonRequired: true };
  }
  if ((from === "resolved" || from === "rejected") && to === "pending") {
    return isSuperAdmin
      ? { ok: true, kind: "reopen", reasonRequired: true }
      : { ok: false, error: "reopen_super_admin_only" };
  }
  return { ok: false, error: "invalid_transition" };
}
