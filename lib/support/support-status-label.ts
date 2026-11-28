/**
 * Customer-facing Support case status label SSOT (DEF-08).
 * 문의 상세 상태 줄 · 쓰기 화면 「진행 중인 문의」 · 내 문의 목록이 모두 이것만 쓴다 —
 * 고객 화면에 `support_cases.status` 원래 값을 그대로 보이지 않는다.
 *
 * 고객 문구 (최종 감사 U-15 · 2026-11-28):
 *   WAITING_USER                          → 답변 완료 (`support_status_active`)
 *   RESOLVED | ARCHIVED                   → 종료 (`support_status_resolved`)
 *   OPEN | WAITING_ADMIN | null · 모르는 값 → 답변 대기 (`support_status_waiting_admin`)
 *   — 상태를 모르면 「답변 완료」로 보이지 않게 「답변 대기」로 둔다.
 */
import type { SupportCaseStatus } from "@/lib/support/support-case-types";
import type { MessageKey } from "@/lib/i18n/messages";

/** 화면의 `t` (현재 언어) — 언어를 참/거짓으로 넘기지 않는다 (i18n SSOT · 최종 점검 U12) */
export type SupportLabelTranslate = (key: MessageKey) => string;

export type SupportCaseStatusLabelKey =
  | "support_status_active"
  | "support_status_resolved"
  | "support_status_waiting_admin";

export function supportCaseStatusLabelMeta(status: SupportCaseStatus | null): {
  key: SupportCaseStatusLabelKey;
} {
  if (status === "RESOLVED" || status === "ARCHIVED") {
    return { key: "support_status_resolved" };
  }
  if (status === "WAITING_USER") {
    return { key: "support_status_active" };
  }
  return { key: "support_status_waiting_admin" };
}

/**
 * 고객 화면 상태 알약 단일 정의 (고객 문의 SSOT UI U1·U2 · Owner 「권장안대로」 2026-11-27).
 * 문의 상세 상태 줄 · 쓰기 화면 「진행 중인 문의」 · 내 문의 목록이 모두 이것만 쓴다 — 색은 **상태**로 정한다(회원/사장님 아님).
 *   종료 + 안 읽은 답변 → 「새 답변」 초록   ·  답변 완료(WAITING_USER) → 「답변 완료」 초록
 *   접수·추가 문의(OPEN·WAITING_ADMIN) → 「답변 대기」 노랑  ·  종료 → 「종료」 회색
 */
export type SupportRequesterStatusPill = {
  key: SupportCaseStatusLabelKey | "support_status_new_reply";
  tone: "answered" | "waiting" | "closed";
  className: string;
};

const PILL_TONE_CLASS: Record<SupportRequesterStatusPill["tone"], string> = {
  answered: "bg-sam-primary-soft text-sam-primary",
  waiting: "bg-sam-warning-soft text-sam-fg",
  closed: "bg-sam-surface-muted text-sam-muted",
};

export function supportRequesterStatusPill(
  status: SupportCaseStatus | null,
  requesterUnreadCount?: number | null
): SupportRequesterStatusPill {
  const closed = status === "RESOLVED" || status === "ARCHIVED";
  if (closed && Number(requesterUnreadCount ?? 0) > 0) {
    return { key: "support_status_new_reply", tone: "answered", className: PILL_TONE_CLASS.answered };
  }
  const key = supportCaseStatusLabelMeta(status).key;
  const tone: SupportRequesterStatusPill["tone"] = closed
    ? "closed"
    : key === "support_status_waiting_admin"
      ? "waiting"
      : "answered";
  return { key, tone, className: PILL_TONE_CLASS[tone] };
}

/**
 * Admin-facing vocabulary SSOT (Phase 3 B1). Admin queue rows, case header, context column,
 * control-plane cards and the admin awareness toast all read these — no screen keeps its own map.
 * Customer wording above stays separate on purpose (customers see 3 states, admins see 5).
 */
export function supportAdminStatusLabel(status: string | null | undefined, t: SupportLabelTranslate): string {
  switch (String(status ?? "").trim()) {
    case "OPEN":
      return t("support_admin_status_open");
    case "WAITING_ADMIN":
      return t("support_admin_status_waiting_admin");
    case "WAITING_USER":
      return t("support_admin_status_waiting_user");
    case "RESOLVED":
      return t("support_admin_status_resolved");
    case "ARCHIVED":
      return t("support_admin_status_archived");
    default:
      return t("support_status_unknown");
  }
}

export function supportAudienceLabel(audience: string | null | undefined, t: SupportLabelTranslate): string {
  return t(
    String(audience ?? "").trim().toUpperCase() === "OWNER" ? "support_audience_owner" : "support_audience_member"
  );
}

export function supportPriorityLabel(priority: string | null | undefined, t: SupportLabelTranslate): string {
  switch (String(priority ?? "").trim()) {
    case "HIGH":
      return t("support_priority_high");
    case "URGENT":
      return t("support_priority_urgent");
    default:
      return t("support_priority_normal");
  }
}

/**
 * 고객 상담 내역 상태 탭 (최종 설계 S63) — 위 고객 라벨 SSOT 의 「상담 종료」 판정과 같은 분류.
 *   진행중(active) = OPEN · WAITING_ADMIN · WAITING_USER
 *   완료(done)     = RESOLVED · ARCHIVED
 */
export type SupportCaseHistoryTab = "active" | "done";

export const SUPPORT_CASE_HISTORY_TABS: readonly SupportCaseHistoryTab[] = ["active", "done"];

export const SUPPORT_CASE_HISTORY_TAB_STATUSES: Record<SupportCaseHistoryTab, readonly SupportCaseStatus[]> = {
  active: ["OPEN", "WAITING_ADMIN", "WAITING_USER"],
  done: ["RESOLVED", "ARCHIVED"],
};

export function supportCaseHistoryTab(status: SupportCaseStatus | null): SupportCaseHistoryTab {
  return supportCaseStatusLabelMeta(status).key === "support_status_resolved" ? "done" : "active";
}

export function parseSupportCaseHistoryTab(raw: string | null | undefined): SupportCaseHistoryTab | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "active" || v === "done" ? v : null;
}
