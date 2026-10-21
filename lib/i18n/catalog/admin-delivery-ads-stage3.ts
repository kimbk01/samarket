/**
 * Stage 3-D 광고 관리자 문구.
 * Separate top-level catalog — `adminMessages` 는 TS 직렬화 한도(TS7056) 근처라 `admin-delivery-ads` 에 추가하지 않는다.
 */

export const adminDeliveryAdsStage3Messages = {
  ko: {
    admin_delivery_ads_bucket_review_unfunded: "레거시·미결제(조치 불요)",
  },
  en: {
    admin_delivery_ads_bucket_review_unfunded: "Legacy unfunded (no action)",
  },
} as const;
