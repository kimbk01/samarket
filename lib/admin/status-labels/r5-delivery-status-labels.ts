/**
 * 배달·매장·광고·상품권 Admin 상태 라벨 (재설계 R5) — 원시 상태 코드를 화면 1차 정보로 쓰지 않는다.
 * import 하면 등록된다 (부수효과). 미등록 값 = 「알 수 없는 상태」 (원문은 기술 정보에서만). Client-safe.
 */

import {
  adminStatusLabelText,
  registerAdminStatusLabels,
} from "@/lib/admin/status-labels/admin-status-label-registry";
import { translate } from "@/lib/i18n/messages";
import { ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT } from "@/lib/stores/store-order-process-model";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 매장 주문 상태 — `STORE_ORDER_STATUS_LIST` (lib/stores/order-status-transitions.ts). */
export const DELIVERY_STORE_ORDER_STATUS_NAMESPACE = "delivery.storeOrder";

/** 이름 = 4단계 정본 키 (사장님·손님·채팅과 같은 말 · 설계안 v2 §3-1) */
const STORE_ORDER_TONES = {
  pending: "neutral",
  accepted: "info",
  preparing: "info",
  ready_for_pickup: "info",
  delivering: "info",
  arrived: "info",
  completed: "success",
  cancel_requested: "warning",
  cancelled: "neutral",
  refund_requested: "warning",
  refunded: "neutral",
} as const;
registerAdminStatusLabels(
  DELIVERY_STORE_ORDER_STATUS_NAMESPACE,
  Object.fromEntries(
    Object.entries(ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT).map(([status, key]) => [
      status,
      { ko: translate("ko", key), en: translate("en", key), tone: STORE_ORDER_TONES[status as keyof typeof STORE_ORDER_TONES] },
    ])
  )
);

/** 배달 광고 진행 상태 — `DELIVERY_AD_LIFECYCLE_STATUSES` (lib/stores/advertising/delivery-ad-lifecycle.ts). */
export const DELIVERY_AD_STATUS_NAMESPACE = "delivery.ad";

registerAdminStatusLabels(DELIVERY_AD_STATUS_NAMESPACE, {
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
  submitted: { ...catalogPair("admin_submitted_4"), tone: "neutral" },
  under_review: { ...catalogPair("admin_under_review_2"), tone: "info" },
  changes_requested: { ...catalogPair("admin_delivery_ads_lifecycle_changes_requested"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "info" },
  scheduled: { ...catalogPair("admin_scheduled_2"), tone: "info" },
  active: { ...catalogPair("admin_active_4"), tone: "success" },
  paused_owner: { ...catalogPair("admin_paused_by_owner_2"), tone: "warning" },
  paused_admin: { ...catalogPair("admin_paused_by_admin_2"), tone: "warning" },
  exhausted: { ...catalogPair("admin_exhausted"), tone: "neutral" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  ended: { ...catalogPair("admin_ended"), tone: "neutral" },
  terminated: { ...catalogPair("admin_delivery_ads_lifecycle_terminated"), tone: "danger" },
  archived: { ...catalogPair("admin_trade_flow_status_archived"), tone: "neutral" },
});

/** 매장 고객 배달 방식 — 노출 스냅샷 `delivery_fee_mode` (`StoreDeliveryFeeMode`, lib/stores/store-commerce-extras.ts). */
export const STORE_DISCOVERY_DELIVERY_FEE_MODE_NAMESPACE = "store.discovery.deliveryFeeMode";

registerAdminStatusLabels(STORE_DISCOVERY_DELIVERY_FEE_MODE_NAMESPACE, {
  self: { ...catalogPair("admin_store_delivery"), tone: "neutral" },
  self_free_promo: { ...catalogPair("admin_store_delivery_free_promo"), tone: "info" },
  courier: { ...catalogPair("admin_courier"), tone: "neutral" },
});

/** 매장 노출 캠페인 종류 — `STORE_DISCOVERY_CAMPAIGN_TYPES` (lib/stores/store-discovery-campaign-authority.ts). */
export const STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE = "store.discovery.campaignType";

registerAdminStatusLabels(STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE, {
  event: { ...catalogPair("admin_event_2"), tone: "neutral" },
  promo: { ...catalogPair("admin_menu_cp_promotion"), tone: "neutral" },
});

/** 플랫폼 수수료 정책의 배달비 반영 방식 — `store_fee_policies.delivery_fee_mode` (none|percent). */
export const DELIVERY_FEE_POLICY_DELIVERY_MODE_NAMESPACE = "delivery.feePolicyDeliveryMode";

registerAdminStatusLabels(DELIVERY_FEE_POLICY_DELIVERY_MODE_NAMESPACE, {
  none: { ...catalogPair("admin_no_delivery_fee_commission"), tone: "neutral" },
  percent: { ...catalogPair("admin_percent_of_delivery_fee"), tone: "neutral" },
});

/** 상품권 — 발급 신청 (`gift_certificate_applications.status`). */
export const GIFT_APPLICATION_STATUS_NAMESPACE = "gift.application";

registerAdminStatusLabels(GIFT_APPLICATION_STATUS_NAMESPACE, {
  draft: { ...catalogPair("admin_draft"), tone: "neutral" },
  submitted: { ...catalogPair("admin_submitted_2"), tone: "neutral" },
  under_review: { ...catalogPair("admin_under_review_2"), tone: "info" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  suspended: { ...catalogPair("admin_suspended_3"), tone: "danger" },
});

/** 상품권 — 발급된 상품권 (`GIFT_INSTANCE_STATUSES`). */
export const GIFT_INSTANCE_STATUS_NAMESPACE = "gift.instance";

registerAdminStatusLabels(GIFT_INSTANCE_STATUS_NAMESPACE, {
  active: { ...catalogPair("admin_active_5"), tone: "success" },
  gift_locked: { ...catalogPair("admin_gift_pending"), tone: "info" },
  partially_redeemed: { ...catalogPair("admin_partially_redeemed"), tone: "info" },
  fully_redeemed: { ...catalogPair("admin_fully_redeemed"), tone: "neutral" },
  suspended: { ...catalogPair("admin_suspended_4"), tone: "danger" },
});

/** 상품권 — 매장 캐시 회수 의무 (`STORE_CASH_RECOVERY_STATUSES`). */
export const GIFT_RECOVERY_STATUS_NAMESPACE = "gift.recovery";

registerAdminStatusLabels(GIFT_RECOVERY_STATUS_NAMESPACE, {
  open: { ...catalogPair("admin_open_2"), tone: "warning" },
  partially_cleared: { ...catalogPair("admin_partially_cleared"), tone: "info" },
  cleared: { ...catalogPair("admin_cleared"), tone: "success" },
});

/** 상품권 — 외부 환전 요청 (`GIFT_CASH_OUT_STATUSES`). */
export const GIFT_CASH_OUT_STATUS_NAMESPACE = "gift.cashOut";

registerAdminStatusLabels(GIFT_CASH_OUT_STATUS_NAMESPACE, {
  requested: { ...catalogPair("admin_requested"), tone: "neutral" },
  approved: { ...catalogPair("admin_approved"), tone: "info" },
  paid: { ...catalogPair("admin_paid_3"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_6"), tone: "neutral" },
});

/** 상품권 — 과거 매장 캐시 전환 요청 (`gift_certificate_conversion_requests.status`). */
export const GIFT_CONVERSION_STATUS_NAMESPACE = "gift.conversion";

registerAdminStatusLabels(GIFT_CONVERSION_STATUS_NAMESPACE, {
  requested: { ...catalogPair("admin_requested"), tone: "neutral" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_6"), tone: "neutral" },
});

/** 위 namespace 의 화면 라벨 (도메인 namespace 에 없으면 공통 → 「알 수 없는 상태」). */
export function r5DeliveryStatusLabel(namespace: string, code: string | null | undefined, ko: boolean): string {
  return adminStatusLabelText(namespace, code, ko);
}
