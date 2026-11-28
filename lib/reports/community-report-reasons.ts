/**
 * 라운지 글·댓글 신고 사유 — 선택 목록 단일 정의 (감사 L9 · 설계 §6.5 신고 시트).
 * 코드는 관리자 사유 표(`lib/admin/status-labels/community-status-labels.ts` REPORT_REASON)와 같은 값을 쓴다.
 * 순서 = 화면 순서. `other` 만 설명 필수.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export const COMMUNITY_REPORT_REASONS = [
  { code: "spam", labelKey: "community_report_reason_spam" },
  { code: "harassment", labelKey: "community_report_reason_harassment" },
  { code: "inappropriate", labelKey: "community_report_reason_inappropriate" },
  { code: "fraud", labelKey: "community_report_reason_fraud" },
  { code: "privacy", labelKey: "community_report_reason_privacy" },
  { code: "other", labelKey: "community_report_reason_other" },
] as const satisfies ReadonlyArray<{ code: string; labelKey: MessageKey }>;

export type CommunityReportReasonCode = (typeof COMMUNITY_REPORT_REASONS)[number]["code"];

const CODES = new Set<string>(COMMUNITY_REPORT_REASONS.map((r) => r.code));

export function isCommunityReportReasonCode(value: unknown): value is CommunityReportReasonCode {
  return typeof value === "string" && CODES.has(value);
}
