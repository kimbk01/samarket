/**
 * 12단계: 관리자 신고 필터·액션 타입 유틸
 */

import type { Report, ReportStatus, ReportTargetType } from "@/lib/types/report";

export const TARGET_TYPE_OPTIONS: { value: ReportTargetType | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "product", label: "상품·게시글 신고" },
  { value: "community", label: "동네생활 피드" },
  { value: "chat", label: "채팅 신고" },
  { value: "user", label: "사용자 신고" },
];

export const REPORT_STATUS_OPTIONS: { value: ReportStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "reviewing", label: "검토중" },
  { value: "reviewed", label: "검토완료" },
  { value: "resolved", label: "처리완료" },
  { value: "rejected", label: "반려" },
  { value: "sanctioned", label: "제재완료" },
];

const REASON_LABELS: { code: string; label: string }[] = [
  { code: "spam", label: "스팸" },
  { code: "fraud", label: "사기" },
  { code: "abusive_language", label: "욕설·비방" },
  { code: "no_show", label: "무응답·노쇼" },
  { code: "inappropriate_item", label: "부적절한 상품" },
  { code: "fake_listing", label: "허위 게시" },
  { code: "other", label: "기타" },
];

export const REASON_CODE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  ...REASON_LABELS.map((o) => ({ value: o.code, label: o.label })),
];

export function filterReports(
  reports: Report[],
  filters: {
    targetType: ReportTargetType | "";
    status: ReportStatus | "";
    reasonCode: string;
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
  return list;
}

export const MODERATION_ACTION_LABELS: Record<string, string> = {
  review_only: "검토완료",
  reject_report: "반려",
  reject: "반려",
  warn: "경고",
  suspend: "일시정지",
  ban: "영구정지",
  blind_product: "상품 블라인드",
  delete_product: "상품 삭제",
  chat_ban: "채팅 제한",
  product_hide: "게시글 숨김",
  account_suspend: "계정 일시 정지",
  account_ban: "계정 영구 정지",
};
