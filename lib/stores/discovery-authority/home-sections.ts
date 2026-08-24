/**
 * CUT 0 — Canonical HOME section ids + contract shape.
 *
 * Paid ad is NOT a section (list insertion behavior only).
 * Legacy shelf ids stay in runtime catalog; mapped here only.
 */

/** TARGET HOME section ids (canonical). Order = product top→bottom intent. */
export const STORES_DISCOVERY_HOME_SECTION_IDS = [
  "industry_entry",
  "hero_banner",
  "order_now",
  "recommended",
  "popular_menu",
  "new_store",
  "editorial_promo",
  "delivery_fee_benefit",
  "high_rating",
  "rest_stores",
] as const;

export type StoresDiscoveryHomeSectionId = (typeof STORES_DISCOVERY_HOME_SECTION_IDS)[number];

export function isStoresDiscoveryHomeSectionId(
  value: unknown
): value is StoresDiscoveryHomeSectionId {
  return (
    typeof value === "string" &&
    (STORES_DISCOVERY_HOME_SECTION_IDS as readonly string[]).includes(value)
  );
}

/** Entity kinds a HOME section may place. */
export const STORES_DISCOVERY_HOME_SECTION_ENTITIES = [
  "taxonomy",
  "banner",
  "store",
  "product",
  "campaign_store",
] as const;

export type StoresDiscoveryHomeSectionEntity =
  (typeof STORES_DISCOVERY_HOME_SECTION_ENTITIES)[number];

export type StoresDiscoveryPaidAdSectionPolicy = "forbidden" | "allowed_as_insertion";

export type StoresDiscoveryCouponSectionPolicy =
  | "forbidden"
  | "badge_if_checkout_eligible";

/**
 * Canonical HOME section contract — later CUTs must not invent ad-hoc fields
 * outside this shape without reopening CUT 0.
 *
 * CUT 0 does not wire this into Hub/composer runtime.
 */
export type StoresDiscoveryHomeSectionContract = {
  id: StoresDiscoveryHomeSectionId;
  entity: StoresDiscoveryHomeSectionEntity;
  /** Who owns the candidate pool for this section. */
  candidateOwner: string;
  /** Who decides membership (in/out). */
  membershipOwner: string;
  /** Who decides order inside the section. */
  rankingOwner: string;
  /** Presentation pattern id / card family (string until CUT 2 binds). */
  presentation: string;
  maxItems: number | null;
  paidAdPolicy: StoresDiscoveryPaidAdSectionPolicy;
  couponPolicy: StoresDiscoveryCouponSectionPolicy;
  /** What Admin may edit for this section (never intra-shelf ranking formula). */
  adminControl: readonly string[];
  /** Empty-candidate behavior. */
  fallback: "hide_section";
};

/** Locked TARGET contracts (foundation snapshot for CUT 2+). */
export const STORES_DISCOVERY_HOME_SECTION_CONTRACTS: readonly StoresDiscoveryHomeSectionContract[] =
  [
    {
      id: "industry_entry",
      entity: "taxonomy",
      candidateOwner: "TAXONOMY",
      membershipOwner: "TAXONOMY.is_active",
      rankingOwner: "TAXONOMY.sort_order",
      presentation: "industry_chip",
      maxItems: null,
      paidAdPolicy: "forbidden",
      couponPolicy: "forbidden",
      adminControl: ["slug", "name", "image", "sort_order", "is_active"],
      fallback: "hide_section",
    },
    {
      id: "hero_banner",
      entity: "banner",
      candidateOwner: "BANNER_AD",
      membershipOwner: "BANNER_AD.active_window",
      rankingOwner: "BANNER_AD.priority",
      presentation: "full_bleed_banner",
      maxItems: 5,
      paidAdPolicy: "forbidden",
      couponPolicy: "forbidden",
      adminControl: ["creative", "schedule", "priority", "status", "deeplink"],
      fallback: "hide_section",
    },
    {
      id: "order_now",
      entity: "product",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "HOME_COMPOSITION.open_deliverable",
      rankingOwner: "HOME_COMPOSITION.composer",
      presentation: "food_horizontal",
      maxItems: 16,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order", "coupon_badge"],
      fallback: "hide_section",
    },
    {
      id: "recommended",
      entity: "store",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "stores.is_featured",
      rankingOwner: "HOME_COMPOSITION.composer",
      presentation: "editorial_grid",
      maxItems: 8,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order"],
      fallback: "hide_section",
    },
    {
      id: "popular_menu",
      entity: "product",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "popularity.completedOrderCount30d",
      rankingOwner: "popularity.sort",
      presentation: "store_horizontal",
      maxItems: 20,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order"],
      fallback: "hide_section",
    },
    {
      id: "new_store",
      entity: "store",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "new_store_signal",
      rankingOwner: "new_store_signal.firstListedAt",
      presentation: "store_teaser_horizontal",
      maxItems: 20,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order"],
      fallback: "hide_section",
    },
    {
      id: "editorial_promo",
      entity: "campaign_store",
      candidateOwner: "EDITORIAL_PROMOTION",
      membershipOwner: "store_discovery_campaigns.active",
      rankingOwner: "EDITORIAL_PROMOTION.compare",
      presentation: "brand_circular",
      maxItems: 20,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["campaign_crud", "shelf_enabled", "title", "max"],
      fallback: "hide_section",
    },
    {
      id: "delivery_fee_benefit",
      entity: "store",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "store_fee.strike_evidence",
      rankingOwner: "HOME_COMPOSITION.composer",
      presentation: "store_horizontal",
      maxItems: 20,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order"],
      fallback: "hide_section",
    },
    {
      id: "high_rating",
      entity: "store",
      candidateOwner: "HOME_COMPOSITION.discovery_pool",
      membershipOwner: "rating.threshold_code_ssot",
      rankingOwner: "HOME_COMPOSITION.composer",
      presentation: "store_horizontal",
      maxItems: 20,
      paidAdPolicy: "forbidden",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "max", "order"],
      fallback: "hide_section",
    },
    {
      id: "rest_stores",
      entity: "store",
      candidateOwner: "HOME_COMPOSITION.discovery_pool_remainder",
      membershipOwner: "HOME_COMPOSITION.remainder",
      rankingOwner: "HOME_COMPOSITION.discovery_api_order",
      presentation: "store_vertical_row",
      maxItems: null,
      paidAdPolicy: "allowed_as_insertion",
      couponPolicy: "badge_if_checkout_eligible",
      adminControl: ["enabled", "title", "paid_ad_allowed", "coupon_badge"],
      fallback: "hide_section",
    },
  ] as const;

/** Legacy / deferred / unavailable — NOT promoted to canonical sections. */
export const STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES = {
  main_stores: "REMOVED_CUT2",
  fast_arrival: "DEFERRED",
  praise_reviews: "UNAVAILABLE",
  queue_popular: "UNAVAILABLE",
  timesale_countdown: "UNAVAILABLE",
} as const;

export type StoresDiscoveryHomeLegacyShelfId =
  keyof typeof STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES;

export type StoresDiscoveryHomeLegacyShelfState =
  (typeof STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES)[StoresDiscoveryHomeLegacyShelfId];

export function homeSectionContractById(
  id: StoresDiscoveryHomeSectionId
): StoresDiscoveryHomeSectionContract {
  const hit = STORES_DISCOVERY_HOME_SECTION_CONTRACTS.find((c) => c.id === id);
  if (!hit) {
    throw new Error(`missing_home_section_contract:${id}`);
  }
  return hit;
}
