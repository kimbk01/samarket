/**
 * Admin Promotion v1 — CTA deep link to Coupon Offer surface.
 * Push ≠ Instance issue. No new audience engine.
 */
export function buildCouponOfferPromotionDeepLink(input: {
  storeId: string;
  offerId: string;
  storeSlug?: string | null;
}): string {
  const offerId = input.offerId.trim();
  const slug = String(input.storeSlug ?? "").trim();
  if (slug) {
    return `/stores/${encodeURIComponent(slug)}?offer=${encodeURIComponent(offerId)}`;
  }
  return `/stores?storeId=${encodeURIComponent(input.storeId.trim())}&offer=${encodeURIComponent(offerId)}`;
}

export function buildAdminPromotionCreateHref(input: {
  storeId: string;
  offerId: string;
  storeSlug?: string | null;
  offerTitle?: string | null;
}): string {
  const deeplink = buildCouponOfferPromotionDeepLink(input);
  const title = String(input.offerTitle ?? "").trim() || "Coupon offer";
  const sp = new URLSearchParams({
    deeplink,
    title: title.slice(0, 80),
    body: "Open the store and get your coupon.",
  });
  return `/admin/notifications/campaigns/new?${sp.toString()}`;
}
