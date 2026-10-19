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
  /** Prefill language for the notification draft. Default: Korean (DEF-52). */
  ko?: boolean;
}): string {
  const deeplink = buildCouponOfferPromotionDeepLink(input);
  const ko = input.ko !== false;
  const title = String(input.offerTitle ?? "").trim() || (ko ? "쿠폰 혜택" : "Coupon offer");
  const sp = new URLSearchParams({
    deeplink,
    title: title.slice(0, 80),
    body: ko ? "매장에서 쿠폰을 받아 보세요." : "Open the store and get your coupon.",
  });
  return `/admin/notifications/campaigns/new?${sp.toString()}`;
}
