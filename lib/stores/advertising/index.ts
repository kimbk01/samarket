/**
 * CUT A — DIBAY Delivery Ad Platform canonical contract owner.
 *
 * Import from `@/lib/stores/advertising` only — do not redeclare product/placement
 * unions in components or composition modules.
 *
 * @see docs/dibay-delivery-advertising-ssot.md
 */

export {
  DELIVERY_AD_PRODUCT_KINDS,
  DELIVERY_MONETIZATION_KINDS,
  DELIVERY_AD_PRODUCT_TO_MONETIZATION,
  DELIVERY_MONETIZATION_TABLE_OWNERS,
  STORE_SPONSORED_CAMPAIGN_TABLE,
  BANNER_AD_CAMPAIGN_TABLE,
  DELIVERY_AD_ISOLATED_AUTHORITIES,
  DISCOVERY_TO_DELIVERY_MONETIZATION,
  DELIVERY_AD_ORGANIC_PAID_ISOLATION,
  DELIVERY_AD_PLATFORM_CUT,
  isDeliveryAdProductKind,
  isDeliveryMonetizationKind,
  monetizationKindToAdProduct,
  isDeliveryAdMonetizationKind,
  type DeliveryAdProductKind,
  type DeliveryMonetizationKind,
} from "@/lib/stores/advertising/delivery-ad-domain";

export {
  ACTIVE_DELIVERY_AD_PLACEMENTS,
  FUTURE_DELIVERY_AD_PLACEMENTS,
  STORE_PAID_AD_DB_PLACEMENT_TO_ACTIVE,
  ACTIVE_TO_STORE_PAID_AD_DB_PLACEMENT,
  BANNER_AD_DB_SURFACE,
  ACTIVE_PLACEMENT_PRODUCT,
  isActiveDeliveryAdPlacement,
  isFutureDeliveryAdPlacement,
  isRuntimeDeliveryAdPlacement,
  mapStorePaidAdDbPlacementToActive,
  mapActiveToStorePaidAdDbPlacement,
  type ActiveDeliveryAdPlacement,
  type FutureDeliveryAdPlacement,
  type DeliveryAdPlacement,
} from "@/lib/stores/advertising/delivery-ad-placement";

export {
  DELIVERY_AD_EXPOSURE_LAYERS,
  COMPATIBILITY_SURFACE_POLICY_KEYS,
  DELIVERY_AD_CAMPAIGN_NE_EXPOSURE,
  STORE_ELIGIBILITY_CUT_A_STATUS,
  type DeliveryAdExposureLayer,
  type CompatibilitySurfacePolicyKey,
} from "@/lib/stores/advertising/delivery-ad-layers";
