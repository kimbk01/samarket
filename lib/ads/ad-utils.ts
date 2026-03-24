/**
 * 22단계: 광고 유틸 (라벨, 필터)
 */

import type {
  AdApplicationStatus,
  AdPlacement,
  AdTargetType,
  AdPaymentStatus,
  AdPaymentMethod,
} from "@/lib/types/ad-application";

export const AD_TARGET_LABELS: Record<AdTargetType, string> = {
  product: "일반 상품",
  shop: "상점",
  banner: "배너",
};

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  home_top: "홈 상단",
  home_middle: "홈 중단",
  search_top: "검색 상단",
  product_detail: "상품 상세",
  shop_featured: "상점 추천",
};

export const AD_APPLICATION_STATUS_LABELS: Record<AdApplicationStatus, string> = {
  pending: "대기",
  waiting_payment: "입금대기",
  approved: "승인됨",
  rejected: "반려",
  active: "노출중",
  expired: "만료",
  cancelled: "취소",
};

export const AD_PAYMENT_STATUS_LABELS: Record<AdPaymentStatus, string> = {
  unpaid: "미결제",
  waiting_confirm: "입금확인대기",
  paid: "결제완료",
  refunded: "환불",
};

export const AD_PAYMENT_METHOD_LABELS: Record<AdPaymentMethod, string> = {
  bank_transfer: "계좌이체",
  gcash: "GCash",
  manual_confirm: "수동확인",
};

export const AD_APPLICATION_STATUS_OPTIONS: {
  value: AdApplicationStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "waiting_payment", label: "입금대기" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "반려" },
  { value: "active", label: "노출중" },
  { value: "expired", label: "만료" },
  { value: "cancelled", label: "취소" },
];

export interface AdminAdApplicationFilters {
  applicationStatus: AdApplicationStatus | "";
}

export function filterAdApplications<T extends { applicationStatus: AdApplicationStatus }>(
  list: T[],
  filters: AdminAdApplicationFilters
): T[] {
  if (!filters.applicationStatus) return [...list];
  return list.filter((a) => a.applicationStatus === filters.applicationStatus);
}
