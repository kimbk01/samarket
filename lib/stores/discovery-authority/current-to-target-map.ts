/**
 * CUT 0 — Current identifier → TARGET canonical mapping.
 *
 * States: CANONICAL | LEGACY | DEPRECATED | DEFERRED | UNAVAILABLE | REMOVE_IN_LATER_CUT | REMOVED
 * Change: mapping_only (default) | removed (authority deleted — CUT A+).
 */

export const STORES_DISCOVERY_MAP_STATES = [
  "CANONICAL",
  "LEGACY",
  "DEPRECATED",
  "DEFERRED",
  "UNAVAILABLE",
  "REMOVE_IN_LATER_CUT",
  "REMOVED",
] as const;

export type StoresDiscoveryMapState = (typeof STORES_DISCOVERY_MAP_STATES)[number];

export type StoresDiscoveryCurrentToTargetRow = {
  current: string;
  canonical: string;
  state: StoresDiscoveryMapState;
  /** mapping_only = rename deferred; removed = authority file deleted. */
  changeInThisCut: "mapping_only" | "removed";
  /** Later CUT that owns runtime change, if any. */
  laterCut: "CUT_1" | "CUT_2" | "CUT_3" | "CUT_4" | "CUT_5" | "CUT_6" | "CUT_7" | "CUT_8" | null;
  notes?: string;
};

/**
 * Exhaustive-enough map for discovery authority foundation.
 * Not a full repo rename plan — only identifiers that collide with TARGET domains.
 */
export const STORES_DISCOVERY_CURRENT_TO_TARGET_MAP: readonly StoresDiscoveryCurrentToTargetRow[] =
  [
    // —— HOME shelf product catalog ids ——
    {
      current: "order_now",
      canonical: "order_now",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "recommended",
      canonical: "recommended",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "popular",
      canonical: "popular_menu",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 2 runtime shelfId = popular_menu; legacy alias resolves overrides",
    },
    {
      current: "new_store",
      canonical: "new_store",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "promo_campaign",
      canonical: "editorial_promo",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 2 runtime shelfId = editorial_promo",
    },
    {
      current: "delivery_fee_discount",
      canonical: "delivery_fee_benefit",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 2 runtime shelfId = delivery_fee_benefit",
    },
    {
      current: "high_rating",
      canonical: "high_rating",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "rest_stores",
      canonical: "rest_stores",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "main_stores",
      canonical: "rest_stores",
      state: "DEPRECATED",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 2 REMOVED — customer authority none; remainder = rest_stores",
    },
    {
      current: "fast_arrival",
      canonical: "fast_arrival",
      state: "DEFERRED",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "Not a TARGET v1 core section — customer shelf unavailable",
    },
    {
      current: "praise_reviews",
      canonical: "praise_reviews",
      state: "UNAVAILABLE",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "queue_popular",
      canonical: "queue_popular",
      state: "UNAVAILABLE",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "timesale_countdown",
      canonical: "timesale_countdown",
      state: "UNAVAILABLE",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    // —— Composer slots (runtime identity; map to section) ——
    {
      current: "slot0Food",
      canonical: "order_now",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "composer slot key — mapped to order_now (CUT 2)",
    },
    {
      current: "slot1Stores",
      canonical: "rest_stores",
      state: "DEPRECATED",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 2 — always empty; main_stores removed",
    },
    {
      current: "slot2Food",
      canonical: "popular_menu",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "newStoreFood",
      canonical: "new_store",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "campaignFood",
      canonical: "editorial_promo",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "slot3Food",
      canonical: "delivery_fee_benefit",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "slot4Food",
      canonical: "high_rating",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "slot5Food",
      canonical: "recommended",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "slot6NearbyStores",
      canonical: "fast_arrival",
      state: "DEFERRED",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "slot6RestStores",
      canonical: "rest_stores",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    // —— Hero / banner ——
    {
      current: "STORES_HOME_HERO_SLIDES",
      canonical: "hero_banner",
      state: "REMOVED",
      changeInThisCut: "removed",
      laterCut: null,
      notes: "CUT A — file deleted; store_banner_ad_campaigns owns HOME hero via /api/stores/home-hero-banners",
    },
    {
      current: "feed_ad_campaigns",
      canonical: "BANNER_AD",
      state: "DEPRECATED",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "Trade/Community only — NOT Delivery HOME hero",
    },
    {
      current: "store_banners",
      canonical: "store_detail",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "store detail hero only — not HOME banner",
    },
    // —— Paid ad ——
    {
      current: "store_paid_ad_campaigns",
      canonical: "STORE_PAID_AD",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "stores_home",
      canonical: "stores_home_rest",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_4",
      notes: "current paid placement string; TARGET paid surface = stores_home_rest",
    },
    {
      current: "stores_browse",
      canonical: "stores_browse",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "paid placement + TARGET surface share name",
    },
    {
      current: "homePaidAdInsertion",
      canonical: "stores_home_rest.paid_ad_allowed",
      state: "REMOVE_IN_LATER_CUT",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_4",
      notes: "hidden composition slot gate",
    },
    {
      current: "homeCouponInsertion",
      canonical: "couponBadgeAllowed",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_6",
      notes: "CUT 6 — payload max only; eligibility = store-coupon-eligibility; display = shelf coupon_integration",
    },
    // —— Coupon / editorial ——
    {
      current: "store_coupon_campaigns",
      canonical: "COUPON_CAMPAIGN",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "coupon_integration",
      canonical: "couponBadgeAllowed",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_6",
      notes: "shelf surface gate — not a coupon entity",
    },
    {
      current: "coupon_enabled",
      canonical: "couponBadgeAllowed",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_6",
      notes: "browse scope surface gate",
    },
    {
      current: "store_discovery_campaigns",
      canonical: "EDITORIAL_PROMOTION",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_8",
      notes: "CUT 7 meaning locked; Admin label rename deferred CUT 8",
    },
    {
      current: "buildBrowseCategoryPromoLine",
      canonical: "DELIVERY_FEE_BENEFIT",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: null,
      notes: "CUT 7 — alias of buildBrowseDeliveryFeeBenefitLine; not editorial",
    },
    // —— Taxonomy vs browse policy ——
    {
      current: "store_categories",
      canonical: "PRIMARY_INDUSTRY",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "store_topics",
      canonical: "SECONDARY_INDUSTRY",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: null,
    },
    {
      current: "store_browse_scope_policy",
      canonical: "BROWSE_SCOPE_POLICY",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_3",
      notes: "narrow UI/fields in CUT 3 — not taxonomy",
    },
    {
      current: "BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER",
      canonical: "PRIMARY_INDUSTRY.sort_order",
      state: "REMOVE_IN_LATER_CUT",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_1",
      notes: "hardcoded consumer order",
    },
    {
      current: "display_title_ko",
      canonical: "PRIMARY_INDUSTRY.name",
      state: "REMOVE_IN_LATER_CUT",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_1",
      notes: "browse scope display title dual naming",
    },
    // —— Composition surfaces ——
    {
      current: "composition:home",
      canonical: "stores_home",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_2",
    },
    {
      current: "composition:browse",
      canonical: "stores_browse",
      state: "LEGACY",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_3",
    },
    // —— TARGET-only (no current runtime) ——
    {
      current: "(none)",
      canonical: "industry_entry",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_2",
      notes: "exists as taxonomy chrome today; section id locked here",
    },
    {
      current: "(none)",
      canonical: "hero_banner",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_5",
      notes: "section id locked; authority REPLACE in CUT 5",
    },
    {
      current: "(none)",
      canonical: "store_banner_ad_campaigns",
      state: "CANONICAL",
      changeInThisCut: "mapping_only",
      laterCut: "CUT_5",
      notes: "TARGET table — not created in CUT 0",
    },
  ] as const;

export function storesDiscoveryMapRowsByLaterCut(
  cut: StoresDiscoveryCurrentToTargetRow["laterCut"]
): StoresDiscoveryCurrentToTargetRow[] {
  return STORES_DISCOVERY_CURRENT_TO_TARGET_MAP.filter((r) => r.laterCut === cut);
}

export function storesDiscoveryMapRowByCurrent(
  current: string
): StoresDiscoveryCurrentToTargetRow | undefined {
  return STORES_DISCOVERY_CURRENT_TO_TARGET_MAP.find((r) => r.current === current);
}
