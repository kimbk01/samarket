/**
 * CUT A/B — DIBAY Delivery Ad Platform canonical contract owner.
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

export {
  DELIVERY_AD_PRODUCT_TABLE,
  DELIVERY_AD_PRODUCT_KEYS,
  DELIVERY_AD_PRODUCT_REGISTRY,
  isDeliveryAdProductKey,
  deliveryAdProductByKey,
  type DeliveryAdProductKey,
  type DeliveryAdCreativeMode,
  type DeliveryAdProductRow,
} from "@/lib/stores/advertising/delivery-ad-product-registry";

export {
  DELIVERY_AD_INVENTORY_TABLE,
  DELIVERY_AD_INVENTORY_KEYS,
  DELIVERY_AD_INVENTORY_SEEDS,
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  FUTURE_DELIVERY_AD_INVENTORY_KEYS,
  LEGACY_PLACEMENT_TO_INVENTORY,
  LEGACY_SURFACE_GATE_CLASSIFICATION,
  DELIVERY_AD_DEVICE_RATIO_CONTRACT,
  inventorySeedByKey,
  isRuntimeActiveInventory,
  mapLegacyPlacementToInventory,
  type DeliveryAdInventoryKey,
  type DeliveryAdRatioSource,
  type DeliveryAdInventoryRuntimeStatus,
  type DeliveryAdInventorySeed,
  type LegacySurfaceGateKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";

export {
  DELIVERY_AD_LIFECYCLE_STATUSES,
  DELIVERY_AD_REVIEW_STATUSES,
  DELIVERY_AD_PRICING_MODELS,
  DELIVERY_AD_PRICING_CONTRACT,
  canTransitionDeliveryAdLifecycle,
  canOwnerRequestLifecycleTransition,
  assertDeliveryAdLifecycleTransition,
  lifecycleImpliesIsActive,
  type DeliveryAdLifecycleStatus,
  type DeliveryAdReviewStatus,
  type DeliveryAdActorRole,
  type DeliveryAdPricingModel,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";

export {
  DELIVERY_AD_CREATIVE_TABLE,
  DELIVERY_AD_CTA_TARGETS,
  isDeliveryAdCtaTarget,
  isForbiddenExternalCta,
  validateDeliveryAdCreativeForInventory,
  validateCtaPayload,
  creativeMatchesInventoryAspect,
  simplifyAspectRatio,
  type DeliveryAdCtaTarget,
  type DeliveryAdCreativeInput,
  type DeliveryAdCreativeValidationError,
} from "@/lib/stores/advertising/delivery-ad-creative";

export {
  DELIVERY_AD_AUDIT_LOG_TABLE,
  canPhysicallyDeleteDeliveryAdCampaign,
  DELIVERY_AD_DELETE_CONTRACT,
  type DeliveryAdAuditInsert,
  type DeliveryAdHistoryFlags,
} from "@/lib/stores/advertising/delivery-ad-audit";

export {
  DELIVERY_AD_EXPOSURE_ELIGIBILITY_FACTORS,
  STORE_ELIGIBILITY_CUT_B_STATUS,
  type DeliveryAdExposureEligibilityFactor,
} from "@/lib/stores/advertising/delivery-ad-eligibility-contract";

export {
  DELIVERY_AD_OWNER_ROUTES,
  DELIVERY_AD_ADMIN_ROUTES,
  DELIVERY_AD_LEGACY_ADMIN_ROUTES,
} from "@/lib/stores/advertising/delivery-ad-routes";

export {
  OWNER_STORE_SPONSORED_INVENTORY_KEYS,
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  validateOwnerStoreSponsoredSchedule,
  validateOwnerInventorySelection,
  isStoreEligibleForOwnerAdApplication,
  ownerLifecycleStatusI18nKey,
  ownerActionTargetLifecycle,
  type OwnerStoreSponsoredInventoryKey,
  type OwnerCampaignAction,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";

export {
  STORE_SPONSORED_BUDGET_GATE,
  STORE_ELIGIBILITY_CUT_D_STATUS,
  SURFACE_TO_REQUIRED_INVENTORY,
  evaluateStoreSponsoredCampaignGates,
  evaluateStoreSponsoredExposureEligibility,
  buildStoreSponsoredEligibilityMapFromOrganicPool,
  dedupeSponsoredCampaignsOnePerStore,
  isSponsoredScheduleActive,
  placementToSponsoredSurface,
  sponsoredSurfaceToPlacement,
  type StoreSponsoredRuntimeCampaign,
  type StoreSponsoredExposureSurface,
  type StoreSponsoredExposureGateResult,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";

export const DELIVERY_AD_PLATFORM_CUT_B = "B" as const;
export const DELIVERY_AD_PLATFORM_CUT_C = "C" as const;
export const DELIVERY_AD_PLATFORM_CUT_D = "D" as const;
