/**
 * 배달 공용 부품 상태 라벨 (수정 계획 2-4) — 매장 노출(디스커버리) 스냅샷 패널의 원시 enum 을 화면에 그대로 쓰지 않는다.
 * 값 출처: `StoreDeliveryFeeMode` (lib/stores/store-commerce-extras.ts) · `STORE_DISCOVERY_CAMPAIGN_TYPES`.
 * import 하면 등록된다 (부수효과). Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 매장 배달비 방식 — `business_hours_json.delivery_fee_mode`. */
export const STORE_DELIVERY_FEE_MODE_NAMESPACE = "delivery.storeDeliveryFeeMode";
/** 매장 노출 캠페인 유형 — `store_discovery_campaigns.campaign_type`. */
export const STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE = "delivery.storeDiscoveryCampaignType";

registerAdminStatusLabels(STORE_DELIVERY_FEE_MODE_NAMESPACE, {
  self: { ko: "자체 배달 (배달비 청구)", en: "Own delivery (fee charged)", tone: "neutral" },
  self_free_promo: { ko: "자체 배달 무료 프로모션", en: "Own delivery · free promo", tone: "info" },
  courier: { ko: "배달 대행", en: "Courier", tone: "neutral" },
});

registerAdminStatusLabels(STORE_DISCOVERY_CAMPAIGN_TYPE_NAMESPACE, {
  event: { ko: "이벤트", en: "Event", tone: "info" },
  promo: { ko: "프로모션", en: "Promotion", tone: "info" },
});
