/**
 * Trade listing promotion overlay — not a public Marketplace status.
 * LIST/SEARCH paint 홍보 separately from ACTIVE | SOLD.
 */
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";

export const TRADE_PROMOTION_PROJECTION = "promoted_content";

const INELIGIBLE_STATUS = new Set([
  "sold",
  "deleted",
  "hidden",
  "suspended",
  "blocked",
  "blinded",
]);

/** Overlay annotation only — never a public listing status. */
export function postHasTradePromotionOverlay(post: { meta?: unknown }): boolean {
  const meta = post.meta;
  return Boolean(
    meta &&
      typeof meta === "object" &&
      !Array.isArray(meta) &&
      (meta as Record<string, unknown>).promotion_projection === TRADE_PROMOTION_PROJECTION
  );
}

/**
 * Promotion overlays public ACTIVE listings (inquiry/negotiating/reserved included).
 * Sold/hidden/deleted and L1 completed are not boost-eligible.
 */
export function isPostEligibleForPromotionBoost(
  status: string | null | undefined,
  sellerListingState?: unknown
): boolean {
  const s = String(status ?? "active").trim().toLowerCase();
  if (INELIGIBLE_STATUS.has(s)) return false;
  return (
    resolveMarketplacePublicListingStatus({
      status: !s || s === "null" ? "active" : s,
      seller_listing_state: sellerListingState,
    }) === "active"
  );
}
