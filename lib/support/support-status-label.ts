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
