/**
 * 18단계: 감사 로그 필터·정렬
 */

import type { AdminAuditLog, AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";

export const CATEGORY_OPTIONS: { value: AuditLogCategory | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "product", label: "상품" },
  { value: "user", label: "회원" },
  { value: "chat", label: "채팅" },
  { value: "report", label: "신고" },
  { value: "review", label: "리뷰" },
  { value: "setting", label: "설정" },
  { value: "auth", label: "관리자 인증" },
];

export const RESULT_OPTIONS: { value: AuditLogResult | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "success", label: "성공" },
  { value: "warning", label: "경고" },
  { value: "error", label: "오류" },
];

export type AuditSortKey = "newest" | "oldest";

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
