/**
 * 12단계: 관리자 신고 필터·액션 타입 유틸
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { Report, ReportStatus, ReportTargetType } from "@/lib/types/report";

export const TARGET_TYPE_OPTIONS: { value: ReportTargetType | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "product", labelKey: "admin_report_filter_target_product" },
  { value: "community", labelKey: "admin_report_filter_target_community" },
  { value: "chat", labelKey: "admin_report_filter_target_chat" },
  { value: "user", labelKey: "admin_report_filter_target_user" },
];

export const REPORT_STATUS_OPTIONS: { value: ReportStatus | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "pending", labelKey: "admin_dashboard_report_pending" },
  { value: "reviewing", labelKey: "admin_report_status_reviewing" },
  { value: "reviewed", labelKey: "admin_dashboard_report_reviewed" },
  { value: "resolved", labelKey: "admin_report_status_resolved" },
  { value: "rejected", labelKey: "admin_dashboard_report_rejected" },
  { value: "sanctioned", labelKey: "admin_report_status_sanctioned" },
];

const REASON_ENTRIES: { code: string; labelKey: MessageKey }[] = [
  { code: "spam", labelKey: "admin_report_reason_spam" },
  { code: "fraud", labelKey: "admin_report_reason_fraud" },
  { code: "abusive_language", labelKey: "admin_report_reason_abusive_language" },
  { code: "no_show", labelKey: "admin_report_reason_no_show" },
  { code: "inappropriate_item", labelKey: "admin_report_reason_inappropriate_item" },
  { code: "fake_listing", labelKey: "admin_report_reason_fake_listing" },
  { code: "other", labelKey: "admin_report_reason_other" },
];

export const REASON_CODE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  ...REASON_ENTRIES.map((o) => ({ value: o.code, labelKey: o.labelKey })),
];

export function filterReports(
  reports: Report[],
  filters: {
    targetType: ReportTargetType | "";
    status: ReportStatus | "";
    reasonCode: string;
    /** Deep-link: /admin/reports?target=<postId|targetId> */
    targetId?: string;
  }
): Report[] {
  let list = [...reports];
  if (filters.targetType) {
    list = list.filter((r) => r.targetType === filters.targetType);
  }
  if (filters.status) {
    list = list.filter((r) => r.status === filters.status);
  }
  if (filters.reasonCode) {
    list = list.filter((r) => r.reasonCode === filters.reasonCode);
  }
  const targetId = (filters.targetId ?? "").trim();
  if (targetId) {
    const q = targetId.toLowerCase();
    list = list.filter((r) => {
      const id = (r.targetId ?? "").trim().toLowerCase();
      return id === q || id.includes(q);
    });
  }
  return list;
}
