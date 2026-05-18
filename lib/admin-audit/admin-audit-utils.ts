/**
 * 18단계: 감사 로그 필터·정렬
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAuditLog, AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";

export const CATEGORY_OPTIONS: { value: AuditLogCategory | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "product", labelKey: "admin_audit_category_product" },
  { value: "user", labelKey: "admin_audit_category_user" },
  { value: "chat", labelKey: "admin_audit_category_chat" },
  { value: "report", labelKey: "admin_audit_category_report" },
  { value: "review", labelKey: "admin_audit_category_review" },
  { value: "setting", labelKey: "admin_audit_category_setting" },
  { value: "auth", labelKey: "admin_audit_category_auth" },
];

export const RESULT_OPTIONS: { value: AuditLogResult | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "success", labelKey: "admin_audit_result_success" },
  { value: "warning", labelKey: "admin_audit_result_warning" },
  { value: "error", labelKey: "admin_audit_result_error" },
];

export type AuditSortKey = "newest" | "oldest";

export const AUDIT_SORT_OPTIONS: { value: AuditSortKey; labelKey: MessageKey }[] = [
  { value: "newest", labelKey: "admin_audit_sort_newest" },
  { value: "oldest", labelKey: "admin_audit_sort_oldest" },
];

export interface AdminAuditFilters {
  category: AuditLogCategory | "";
  adminNickname: string;
  result: AuditLogResult | "";
  searchQuery: string;
  sortKey: AuditSortKey;
}

export function filterAndSortLogs(
  logs: AdminAuditLog[],
  filters: AdminAuditFilters
): AdminAuditLog[] {
  let list = [...logs];

  if (filters.category) {
    list = list.filter((l) => l.category === filters.category);
  }
  if (filters.result) {
    list = list.filter((l) => l.result === filters.result);
  }
  if (filters.adminNickname.trim()) {
    const q = filters.adminNickname.trim().toLowerCase();
    list = list.filter((l) => l.adminNickname.toLowerCase().includes(q));
  }
  if (filters.searchQuery.trim()) {
    const q = filters.searchQuery.trim().toLowerCase();
    list = list.filter((l) => {
      const matchTargetId = (l.targetId ?? "").toLowerCase().includes(q);
      const matchTargetLabel = (l.targetLabel ?? "").toLowerCase().includes(q);
      const matchAction = l.actionType.toLowerCase().includes(q);
      const matchSummary = l.summary.toLowerCase().includes(q);
      return matchTargetId || matchTargetLabel || matchAction || matchSummary;
    });
  }

  list.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return filters.sortKey === "newest" ? tb - ta : ta - tb;
  });

  return list;
}
