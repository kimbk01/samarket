/**
 * CUT A — DIBAY Delivery Ad Platform domain contract (ONE authority).
 *
 * DO NOT: invent billing/owner/impression here. Vocabulary + boundary only.
 * Discovery SCREAMING monetization kinds remain in discovery-authority for CUT0–8
 * compatibility; map via helpers below — do not declare parallel product unions elsewhere.
 *
 * @see docs/dibay-delivery-advertising-ssot.md
 */

/** Paid Delivery products only — never coupon / editorial / fee / trade feed. */
export const DELIVERY_AD_PRODUCT_KINDS = ["store_sponsored", "banner"] as const;
export type DeliveryAdProductKind = (typeof DELIVERY_AD_PRODUCT_KINDS)[number];

/**
 * Full Delivery monetization axis (ads + non-ads).
 * Generic "광고" / "promotion" must not collapse these.
 */
export const DELIVERY_MONETIZATION_KINDS = [
  "store_paid_ad",
  "banner_ad",
  "coupon",
  "editorial_promotion",
  "delivery_fee_promotion",
] as const;
export type DeliveryMonetizationKind = (typeof DELIVERY_MONETIZATION_KINDS)[number];

export const DELIVERY_AD_PRODUCT_TO_MONETIZATION = {
  store_sponsored: "store_paid_ad",
  banner: "banner_ad",
} as const satisfies Record<DeliveryAdProductKind, DeliveryMonetizationKind>;

/** Canonical table owners — schema unchanged in CUT A. */
export const DELIVERY_MONETIZATION_TABLE_OWNERS = {
  store_paid_ad: "store_paid_ad_campaigns",
  banner_ad: "store_banner_ad_campaigns",
  coupon: "store_coupon_campaigns",
  editorial_promotion: "store_discovery_campaigns",
  delivery_fee_promotion: "store_fee_evidence",
} as const satisfies Record<DeliveryMonetizationKind, string>;

/**
 * store_paid_ad_campaigns =
 * STORE_PAID_AD = store_sponsored = paid list placement campaign.
 * FORBIDDEN uses: banner, coupon, editorial, fee promo, organic ranking boost.
 */
export const STORE_SPONSORED_CAMPAIGN_TABLE = "store_paid_ad_campaigns" as const;

/**
 * store_banner_ad_campaigns =
 * BANNER_AD = image creative Delivery banner campaign.
 * Current capability (CUT A): Admin HOME hero CMS only — no Owner product,
 * billing, review, or budget. Do not abstract those as if they exist.
 */
export const BANNER_AD_CAMPAIGN_TABLE = "store_banner_ad_campaigns" as const;

/** Non-Delivery / non-ad authorities — never DeliveryAdProductKind. */
export const DELIVERY_AD_ISOLATED_AUTHORITIES = {
  store_detail_banners: "store_banners",
  trade_community_feed_ads: "feed_ad_campaigns",
  editorial_promotion: "store_discovery_campaigns",
  coupon: "store_coupon_campaigns",
} as const;

/** Discovery SCREAMING kinds ↔ Delivery monetization (bridge only). */
export const DISCOVERY_TO_DELIVERY_MONETIZATION = {
  STORE_PAID_AD: "store_paid_ad",
  BANNER_AD: "banner_ad",
  COUPON: "coupon",
  EDITORIAL_PROMOTION: "editorial_promotion",
  DELIVERY_FEE_BENEFIT: "delivery_fee_promotion",
} as const;

export function isDeliveryAdProductKind(value: unknown): value is DeliveryAdProductKind {
  return value === "store_sponsored" || value === "banner";
}

export function isDeliveryMonetizationKind(value: unknown): value is DeliveryMonetizationKind {
  return (
    typeof value === "string" &&
    (DELIVERY_MONETIZATION_KINDS as readonly string[]).includes(value)
  );
}

export function monetizationKindToAdProduct(
  kind: DeliveryMonetizationKind
): DeliveryAdProductKind | null {
  if (kind === "store_paid_ad") return "store_sponsored";
  if (kind === "banner_ad") return "banner";
  return null;
}

export function isDeliveryAdMonetizationKind(kind: DeliveryMonetizationKind): boolean {
  return monetizationKindToAdProduct(kind) != null;
}

/**
 * ORGANIC / PAID HARD ISOLATION
 *
 * FORBIDDEN:
 *   organicScore += paidBoost
 *   ranking += campaignWeight
 *   recommendedScore += adBid
 *
 * Canonical pipeline:
 *   ORGANIC CANDIDATES → ORGANIC RANKING → ORGANIC RESULT
 *   PAID ELIGIBILITY → SPONSORED INSERTION PLAN → INTERLEAVE
 *
 * Paid campaign types must not flow into recommended / popular / distance /
 * rating / fast / candidate ranking modules.
 */
export const DELIVERY_AD_ORGANIC_PAID_ISOLATION = {
  forbidden: [
    "organicScore += paidBoost",
    "ranking += campaignWeight",
    "recommendedScore += adBid",
  ] as const,
  pipeline: [
    "organic_candidates",
    "organic_ranking",
    "organic_result",
    "paid_eligibility",
    "sponsored_insertion_plan",
    "interleave",
  ] as const,
} as const;

export const DELIVERY_AD_PLATFORM_CUT = "A" as const;
