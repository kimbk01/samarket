/**
 * CUT 0 — DIBAY Stores Discovery Authority Foundation.
 *
 * Canonical domain / section / surface / monetization contracts.
 * Runtime cutover is FORBIDDEN in CUT 0.
 *
 * Owner path: `lib/stores/discovery-authority/*`
 * Do not duplicate these constants under composition/ or product/ catalogs.
 */

export {
  STORES_DISCOVERY_DOMAINS,
  isStoresDiscoveryDomain,
  type StoresDiscoveryDomain,
} from "@/lib/stores/discovery-authority/domains";

export {
  PRIMARY_INDUSTRY,
  SECONDARY_INDUSTRY,
  BROWSE_SCOPE_POLICY,
  STORES_DISCOVERY_TAXONOMY_TERMS,
  STORES_DISCOVERY_TAXONOMY_TABLE_OWNERS,
  TAXONOMY_NEQ_BROWSE_SCOPE_POLICY,
  type StoresDiscoveryTaxonomyTerm,
} from "@/lib/stores/discovery-authority/taxonomy-terms";

export {
  STORES_DISCOVERY_HOME_SECTION_IDS,
  STORES_DISCOVERY_HOME_SECTION_ENTITIES,
  STORES_DISCOVERY_HOME_SECTION_CONTRACTS,
  STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES,
  isStoresDiscoveryHomeSectionId,
  homeSectionContractById,
  type StoresDiscoveryHomeSectionId,
  type StoresDiscoveryHomeSectionEntity,
  type StoresDiscoveryHomeSectionContract,
  type StoresDiscoveryPaidAdSectionPolicy,
  type StoresDiscoveryCouponSectionPolicy,
  type StoresDiscoveryHomeLegacyShelfId,
  type StoresDiscoveryHomeLegacyShelfState,
} from "@/lib/stores/discovery-authority/home-sections";

export {
  STORES_DISCOVERY_SURFACES,
  STORES_DISCOVERY_SURFACE_CURRENT_ALIASES,
  STORES_DISCOVERY_PAID_AD_ALLOWED_SURFACES,
  STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES,
  isStoresDiscoverySurface,
  type StoresDiscoverySurface,
} from "@/lib/stores/discovery-authority/surfaces";

export {
  STORE_PAID_AD,
  BANNER_AD,
  COUPON,
  DELIVERY_FEE_BENEFIT,
  EDITORIAL_PROMOTION,
  STORES_DISCOVERY_MONETIZATION_KINDS,
  COUPON_CAMPAIGN,
  COUPON_BADGE_ALLOWED,
  STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS,
  STORE_DISCOVERY_CAMPAIGNS_MEANING,
  isStorePaidAdKind,
  isBannerAdKind,
  type StoresDiscoveryMonetizationKind,
  type StoresDiscoveryCouponSurfacePolicyKey,
  type StoresDiscoveryStorePaidAdProduct,
  type StoresDiscoveryBannerAdProduct,
} from "@/lib/stores/discovery-authority/monetization";

export {
  STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS,
  deriveStoresDiscoveryPaidAdExposureState,
  type StoresDiscoveryPaidAdExposureFactors,
  type StoresDiscoveryPaidAdBlockingReason,
  type StoresDiscoveryPaidAdExposureState,
} from "@/lib/stores/discovery-authority/paid-exposure-state";

export {
  STORES_DISCOVERY_MAP_STATES,
  STORES_DISCOVERY_CURRENT_TO_TARGET_MAP,
  storesDiscoveryMapRowsByLaterCut,
  storesDiscoveryMapRowByCurrent,
  type StoresDiscoveryMapState,
  type StoresDiscoveryCurrentToTargetRow,
} from "@/lib/stores/discovery-authority/current-to-target-map";

/** CUT marker — foundation locked when this module is imported by later CUTs. */
export const STORES_DISCOVERY_AUTHORITY_FOUNDATION_CUT = 0 as const;
