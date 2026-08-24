/**
 * CUT 0 — Monetization terminology: never collapse into catch-all "promotion".
 */

export const STORE_PAID_AD = "STORE_PAID_AD" as const;
export const BANNER_AD = "BANNER_AD" as const;
export const COUPON = "COUPON" as const;
export const DELIVERY_FEE_BENEFIT = "DELIVERY_FEE_BENEFIT" as const;
export const EDITORIAL_PROMOTION = "EDITORIAL_PROMOTION" as const;

/**
 * Product axes that must stay separate.
 * Do not use "promotion" as a union type that mixes these.
 */
export const STORES_DISCOVERY_MONETIZATION_KINDS = [
  STORE_PAID_AD,
  BANNER_AD,
  COUPON,
  DELIVERY_FEE_BENEFIT,
  EDITORIAL_PROMOTION,
] as const;

export type StoresDiscoveryMonetizationKind =
  (typeof STORES_DISCOVERY_MONETIZATION_KINDS)[number];

/** Canonical campaign entity for coupons — one entity for display + checkout. */
export const COUPON_CAMPAIGN = "COUPON_CAMPAIGN" as const;

/**
 * Surface display permission — NOT a second coupon entity.
 * Runtime: shelf coupon_integration / browse coupon_enabled → couponBadgeAllowed (CUT 6).
 * Does not activate/deactivate store_coupon_campaigns rows.
 */
export const COUPON_BADGE_ALLOWED = "couponBadgeAllowed" as const;

export type StoresDiscoveryCouponSurfacePolicyKey = typeof COUPON_BADGE_ALLOWED;

/** Table owners (documentation — no schema change in CUT 0). */
export const STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS = {
  STORE_PAID_AD: "store_paid_ad_campaigns",
  BANNER_AD: "store_banner_ad_campaigns", // CUT 5 — created; HOME hero only
  COUPON: "store_coupon_campaigns",
  DELIVERY_FEE_BENEFIT: "store_fee_evidence", // not a campaign table
  EDITORIAL_PROMOTION: "store_discovery_campaigns",
} as const;

/**
 * store_discovery_campaigns meaning lock:
 * EDITORIAL_PROMOTION only — not coupon, not paid ad, not banner, not delivery-fee benefit.
 * CUT 7 — domain separation hard lock.
 */
export const STORE_DISCOVERY_CAMPAIGNS_MEANING = EDITORIAL_PROMOTION;

export function isStorePaidAdKind(kind: StoresDiscoveryMonetizationKind): boolean {
  return kind === STORE_PAID_AD;
}

export function isBannerAdKind(kind: StoresDiscoveryMonetizationKind): boolean {
  return kind === BANNER_AD;
}

/** Type-level separation reminder — paid list insertion ≠ banner creative. */
export type StoresDiscoveryStorePaidAdProduct = {
  kind: typeof STORE_PAID_AD;
  behavior: "organic_list_insertion";
};

export type StoresDiscoveryBannerAdProduct = {
  kind: typeof BANNER_AD;
  behavior: "creative_banner_surface";
};
