/**
 * 배달·매장·광고·상품권 Admin 상태 라벨 (재설계 R5) — 원시 상태 코드를 화면 1차 정보로 쓰지 않는다.
 * import 하면 등록된다 (부수효과). 미등록 값 = 「알 수 없는 상태」 (원문은 기술 정보에서만). Client-safe.
 */

import {
  adminStatusLabelText,
  registerAdminStatusLabels,
} from "@/lib/admin/status-labels/admin-status-label-registry";

/** 매장 주문 상태 — `STORE_ORDER_STATUS_LIST` (lib/stores/order-status-transitions.ts). */
export const DELIVERY_STORE_ORDER_STATUS_NAMESPACE = "delivery.storeOrder";

registerAdminStatusLabels(DELIVERY_STORE_ORDER_STATUS_NAMESPACE, {
  pending: { ko: "주문 접수 대기", en: "Pending", tone: "neutral" },
  accepted: { ko: "주문 수락", en: "Accepted", tone: "info" },
  preparing: { ko: "조리 중", en: "Preparing", tone: "info" },
  ready_for_pickup: { ko: "픽업 대기", en: "Ready for pickup", tone: "info" },
  delivering: { ko: "배달 중", en: "Delivering", tone: "info" },
  arrived: { ko: "도착", en: "Arrived", tone: "info" },
  completed: { ko: "완료", en: "Completed", tone: "success" },
  cancel_requested: { ko: "취소 요청", en: "Cancel requested", tone: "warning" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
  refund_requested: { ko: "환불 요청", en: "Refund requested", tone: "warning" },
  refunded: { ko: "환불됨", en: "Refunded", tone: "neutral" },
});

/** 배달 광고 진행 상태 — `DELIVERY_AD_LIFECYCLE_STATUSES` (lib/stores/advertising/delivery-ad-lifecycle.ts). */
export const DELIVERY_AD_STATUS_NAMESPACE = "delivery.ad";

registerAdminStatusLabels(DELIVERY_AD_STATUS_NAMESPACE, {
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
  submitted: { ko: "심사 대기", en: "Submitted", tone: "neutral" },
  under_review: { ko: "심사 중", en: "Under review", tone: "info" },
  changes_requested: { ko: "수정 요청", en: "Changes requested", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "info" },
  scheduled: { ko: "노출 예정", en: "Scheduled", tone: "info" },
  active: { ko: "노출 중", en: "Active", tone: "success" },
  paused_owner: { ko: "사장님 일시 중지", en: "Paused by owner", tone: "warning" },
  paused_admin: { ko: "운영 일시 중지", en: "Paused by admin", tone: "warning" },
  exhausted: { ko: "예산 소진", en: "Exhausted", tone: "neutral" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  ended: { ko: "종료", en: "Ended", tone: "neutral" },
  terminated: { ko: "강제 종료", en: "Terminated", tone: "danger" },
  archived: { ko: "보관", en: "Archived", tone: "neutral" },
});

/** 매장 고객 배달 방식 — 노출 스냅샷 `delivery_fee_mode` (`StoreDeliveryFeeMode`, lib/stores/store-commerce-extras.ts). */
export const STORE_DISCOVERY_DELIVERY_FEE_MODE_NAMESPACE = "store.discovery.deliveryFeeMode";

registerAdminStatusLabels(STORE_DISCOVERY_DELIVERY_FEE_MODE_NAMESPACE, {
  self: { ko: "매장 직접 배달", en: "Store delivery", tone: "neutral" },
  self_free_promo: { ko: "매장 직접 배달 (무료 배달 행사)", en: "Store delivery (free promo)", tone: "info" },
  courier: { ko: "배달 대행", en: "Courier", tone: "neutral" },
});

/** 매장 노출 캠페인 종류 — `STORE_DISCOVERY_CAMPAIGN_TYPES` (lib/stores/store-discovery-campaign-authority.ts). */
export const STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE = "store.discovery.campaignType";

registerAdminStatusLabels(STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE, {
  event: { ko: "이벤트", en: "Event", tone: "neutral" },
  promo: { ko: "프로모션", en: "Promotion", tone: "neutral" },
});

/** 플랫폼 수수료 정책의 배달비 반영 방식 — `store_fee_policies.delivery_fee_mode` (none|percent). */
export const DELIVERY_FEE_POLICY_DELIVERY_MODE_NAMESPACE = "delivery.feePolicyDeliveryMode";

registerAdminStatusLabels(DELIVERY_FEE_POLICY_DELIVERY_MODE_NAMESPACE, {
  none: { ko: "배달비 수수료 없음", en: "No delivery-fee commission", tone: "neutral" },
  percent: { ko: "배달비 비율 수수료", en: "Percent of delivery fee", tone: "neutral" },
});

/** 상품권 — 발급 신청 (`gift_certificate_applications.status`). */
export const GIFT_APPLICATION_STATUS_NAMESPACE = "gift.application";

registerAdminStatusLabels(GIFT_APPLICATION_STATUS_NAMESPACE, {
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
  submitted: { ko: "신청 접수", en: "Submitted", tone: "neutral" },
  under_review: { ko: "심사 중", en: "Under review", tone: "info" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  suspended: { ko: "중지", en: "Suspended", tone: "danger" },
});

/** 상품권 — 발급된 상품권 (`GIFT_INSTANCE_STATUSES`). */
export const GIFT_INSTANCE_STATUS_NAMESPACE = "gift.instance";

registerAdminStatusLabels(GIFT_INSTANCE_STATUS_NAMESPACE, {
  active: { ko: "사용 가능", en: "Active", tone: "success" },
  gift_locked: { ko: "선물 진행 중", en: "Gift pending", tone: "info" },
  partially_redeemed: { ko: "일부 사용", en: "Partially redeemed", tone: "info" },
  fully_redeemed: { ko: "사용 완료", en: "Fully redeemed", tone: "neutral" },
  suspended: { ko: "사용 중지", en: "Suspended", tone: "danger" },
});

/** 상품권 — 매장 캐시 회수 의무 (`STORE_CASH_RECOVERY_STATUSES`). */
export const GIFT_RECOVERY_STATUS_NAMESPACE = "gift.recovery";

registerAdminStatusLabels(GIFT_RECOVERY_STATUS_NAMESPACE, {
  open: { ko: "회수 대기", en: "Open", tone: "warning" },
  partially_cleared: { ko: "일부 회수", en: "Partially cleared", tone: "info" },
  cleared: { ko: "회수 완료", en: "Cleared", tone: "success" },
});

/** 상품권 — 외부 환전 요청 (`GIFT_CASH_OUT_STATUSES`). */
export const GIFT_CASH_OUT_STATUS_NAMESPACE = "gift.cashOut";

registerAdminStatusLabels(GIFT_CASH_OUT_STATUS_NAMESPACE, {
  requested: { ko: "요청", en: "Requested", tone: "neutral" },
  approved: { ko: "승인", en: "Approved", tone: "info" },
  paid: { ko: "지급 완료", en: "Paid", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
});

/** 상품권 — 과거 매장 캐시 전환 요청 (`gift_certificate_conversion_requests.status`). */
export const GIFT_CONVERSION_STATUS_NAMESPACE = "gift.conversion";

registerAdminStatusLabels(GIFT_CONVERSION_STATUS_NAMESPACE, {
  requested: { ko: "요청", en: "Requested", tone: "neutral" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
});

/** 위 namespace 의 화면 라벨 (도메인 namespace 에 없으면 공통 → 「알 수 없는 상태」). */
export function r5DeliveryStatusLabel(namespace: string, code: string | null | undefined, ko: boolean): string {
  return adminStatusLabelText(namespace, code, ko);
}
