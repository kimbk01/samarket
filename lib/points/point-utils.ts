/**
 * 23단계: 포인트 라벨 / 필터
 */

import type {
  PointChargeRequestStatus,
  PointPaymentMethod,
  PointLedgerEntryType,
  PointPromotionOrderStatus,
  PointPromotionPlacement,
} from "@/lib/types/point";

export const POINT_CHARGE_STATUS_LABELS: Record<PointChargeRequestStatus, string> = {
  pending: "대기",
  waiting_confirm: "입금확인대기",
  on_hold: "보류",
  approved: "승인",
  rejected: "반려",
  cancelled: "취소",
};

export const POINT_PAYMENT_METHOD_LABELS: Record<PointPaymentMethod, string> = {
  bank_transfer: "계좌이체",
  gcash: "GCash",
  manual_confirm: "수동확인",
};

export const POINT_LEDGER_ENTRY_LABELS: Record<PointLedgerEntryType, string> = {
  charge: "충전",
  spend: "사용",
  refund: "환불",
  admin_adjust: "관리자조정",
  expire: "만료",
  reward: "커뮤니티지급",
  reverse: "커뮤니티회수",
  ad_purchase: "광고구매",
  ad_refund: "광고환불",
};

export const POINT_PROMOTION_ORDER_STATUS_LABELS: Record<
  PointPromotionOrderStatus,
  string
> = {
  pending: "대기",
  active: "노출중",
  expired: "만료",
  cancelled: "취소",
};

export const POINT_PROMOTION_PLACEMENT_LABELS: Record<PointPromotionPlacement, string> = {
  home_top: "홈 상단",
  home_middle: "홈 중단",
  search_top: "검색 상단",
  shop_featured: "상점 추천",
};

export const POINT_CHARGE_STATUS_OPTIONS: {
  value: PointChargeRequestStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "waiting_confirm", label: "입금확인대기" },
  { value: "on_hold", label: "보류" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
  { value: "cancelled", label: "취소" },
];

export interface AdminPointChargeFilters {
  requestStatus: PointChargeRequestStatus | "";
}

export function filterPointChargeRequests<T extends { requestStatus: PointChargeRequestStatus }>(
  list: T[],
  filters: AdminPointChargeFilters
): T[] {
  if (!filters.requestStatus) return [...list];
  return list.filter((r) => r.requestStatus === filters.requestStatus);
}
