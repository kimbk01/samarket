/**
 * Customer-facing Support case status label SSOT (DEF-08).
 * Support modal header and Support history list both read this — no surface may print
 * the raw `support_cases.status` enum to customers.
 *
 * Mapping is the pre-existing SupportModalHost mapping, moved here unchanged:
 *   OPEN | WAITING_ADMIN     → 답변 대기
 *   WAITING_USER             → 상담 중
 *   RESOLVED | ARCHIVED      → 상담 종료
 */
import type { SupportCaseStatus } from "@/lib/support/support-case-types";

export type SupportCaseStatusLabelKey =
  | "support_status_active"
  | "support_status_resolved"
  | "support_status_waiting_admin";

export function supportCaseStatusLabelMeta(status: SupportCaseStatus | null): {
  key: SupportCaseStatusLabelKey;
  fallbackKo: string;
  fallbackEn: string;
} {
  if (!status) {
    return { key: "support_status_active", fallbackKo: "상담 중", fallbackEn: "In progress" };
  }
  if (status === "RESOLVED" || status === "ARCHIVED") {
    return { key: "support_status_resolved", fallbackKo: "상담 종료", fallbackEn: "Closed" };
  }
  if (status === "WAITING_ADMIN" || status === "OPEN") {
    return {
      key: "support_status_waiting_admin",
      fallbackKo: "답변 대기",
      fallbackEn: "Awaiting reply",
    };
  }
  return { key: "support_status_active", fallbackKo: "상담 중", fallbackEn: "In progress" };
}

/**
 * Admin-facing vocabulary SSOT (Phase 3 B1). Admin queue rows, case header, context column,
 * control-plane cards and the admin awareness toast all read these — no screen keeps its own map.
 * Customer wording above stays separate on purpose (customers see 3 states, admins see 5).
 */
export function supportAdminStatusLabel(status: string | null | undefined, ko: boolean): string {
  switch (String(status ?? "").trim()) {
    case "OPEN":
      return ko ? "접수" : "Open";
    case "WAITING_ADMIN":
      return ko ? "답변 대기" : "Waiting admin";
    case "WAITING_USER":
      return ko ? "사용자 답변 대기" : "Waiting user";
    case "RESOLVED":
      return ko ? "종료" : "Resolved";
    case "ARCHIVED":
      return ko ? "보관" : "Archived";
    default:
      return ko ? "확인 필요" : "Unknown";
  }
}

export function supportAudienceLabel(audience: string | null | undefined, ko: boolean): string {
  return String(audience ?? "").trim().toUpperCase() === "OWNER"
    ? ko
      ? "사장님"
      : "Owner"
    : ko
      ? "회원"
      : "Member";
}

export function supportPriorityLabel(priority: string | null | undefined, ko: boolean): string {
  switch (String(priority ?? "").trim()) {
    case "HIGH":
      return ko ? "높음" : "High";
    case "URGENT":
      return ko ? "긴급" : "Urgent";
    default:
      return ko ? "일반" : "Normal";
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
