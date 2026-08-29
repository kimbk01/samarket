/**
 * CUT B — Canonical route ownership (UI in CUT C / F).
 */

export const DELIVERY_AD_OWNER_ROUTES = {
  hub: "/stores/owner/ads",
  createStoreSponsored: "/stores/owner/ads/new/store-sponsored",
  /** Banner Owner create — CUT E. */
  createBanner: "/stores/owner/ads/new/banner",
  detail: (campaignId: string) =>
    `/stores/owner/ads/${encodeURIComponent(campaignId)}`,
} as const;

export const DELIVERY_AD_ADMIN_ROUTES = {
  hub: "/admin/delivery-ads",
  detail: (campaignId: string) =>
    `/admin/delivery-ads/${encodeURIComponent(campaignId)}`,
} as const;

/** Existing writers redirected / mutation-disabled as of CUT F. */
export const DELIVERY_AD_LEGACY_ADMIN_ROUTES = {
  storeSponsored: "/admin/store-insertions",
  banner: "/admin/store-banner-ads",
  disposition: "canonical_redirect",
  canonical: "/admin/delivery-ads",
} as const;
