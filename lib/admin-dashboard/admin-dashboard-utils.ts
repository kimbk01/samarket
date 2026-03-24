/**
 * 19단계: 대시보드 라벨/옵션
 */

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제",
};

export const USER_STATUS_LABELS: Record<string, string> = {
  active: "정상",
  warned: "경고",
  suspended: "정지",
  banned: "영구정지",
  premium: "프리미엄",
  admin: "관리자",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  reviewed: "검토완료",
  rejected: "반려",
};

export const CHAT_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  blocked: "차단",
  reported: "신고됨",
  archived: "보관",
};

export const DATE_RANGE_OPTIONS = [
  { value: "7", label: "최근 7일" },
  { value: "14", label: "최근 14일" },
  { value: "30", label: "최근 30일" },
] as const;
