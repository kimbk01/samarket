/**
 * CUT B — Canonical route ownership (UI in CUT C / F).
 *
 * Ads dual-stack removal:
 * - `control` = cross-domain Ads Control Plane (관제) — read composition
 * - `hub` = Delivery store_sponsored + banner ops only — lifecycle list
 * Mutation detail remains `/admin/delivery-ads/[campaignId]` (single writer UI).
 */

export const DELIVERY_AD_OWNER_ROUTES = {
  hub: "/stores/owner/ads",
  createStoreSponsored: "/stores/owner/ads/new/store-sponsored",
  /** Banner Owner create — CUT E. */
  createBanner: "/stores/owner/ads/new/banner",
  /** R4 Partner membership apply / status. */
  partner: "/stores/owner/ads/partner",
  detail: (campaignId: string) =>
    `/stores/owner/ads/${encodeURIComponent(campaignId)}`,
} as const;

export const DELIVERY_AD_ADMIN_ROUTES = {
  /** Cross-domain Ads 관제 (Control Plane). Not Delivery lifecycle list. */
  control: "/admin/delivery-ads",
  /** Delivery 매장 홍보 + 배달 배너 operator hub (single Delivery ops path). */
  hub: "/admin/delivery-ads/manage",
  commercialSettings: "/admin/delivery-ads/commercial-settings",
  /** Launch placement inventory management (human language). */
  inventory: "/admin/delivery-ads/inventory",
  /** Cash structured charge-request queue (≠ CUT3 campaign thread). */
  cashCharges: "/admin/delivery-ads/cash-charges",
  /** R4 DIBAY first-party Banner create workspace. */
  firstPartyNew: "/admin/delivery-ads/first-party/new",
  partnerMemberships: "/admin/delivery-ads/partner",
  detail: (campaignId: string) =>
    `/admin/delivery-ads/${encodeURIComponent(campaignId)}`,
  creative: (campaignId: string) =>
    `/admin/delivery-ads/${encodeURIComponent(campaignId)}/creative`,
} as const;

/** Existing writers redirected / mutation-disabled as of CUT F. */
export const DELIVERY_AD_LEGACY_ADMIN_ROUTES = {
  storeSponsored: "/admin/store-insertions",
  banner: "/admin/store-banner-ads",
  disposition: "canonical_redirect",
  canonical: "/admin/delivery-ads/manage",
} as const;
