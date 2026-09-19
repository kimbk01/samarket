/**
 * Philife `post_ads` authority vs Paid Exposure / Feed Ads — semantic LOCK.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 *
 * FINAL ROLES:
 * - Community member paid pin → `point_promotion_orders` (domain=community) — NEW WRITES
 * - Philife `post_ads` top_fixed → LEGACY READ ONLY (no new applies)
 * - Philife `post_ads` mid_insert → QUARANTINED (Feed Ads owns mid-slot)
 * - Philife/Trade `post_ads` highlight → NEW WRITES CLOSED (CUT C)
 *   Catalog names imply Trade detail bottom/premium, but no current customer
 *   loader/renderer consumes `ad_type=highlight`. Apply would spend Points with
 *   no customer effect (BROKEN_SELLABLE_WRITER). Historical rows remain readable
 *   via Admin/Member post_ads lists only.
 * - Admin Feed Advertisement → `feed_ad_campaigns`
 * - Member Trade Promotion → `point_promotion_orders` (domain=trade)
 */

import type { AdType } from "@/lib/ads/types";

export type PostAdsAdTypeRole =
  | "LEGACY_READ_ONLY_COMMUNITY_PIN"
  | "QUARANTINE_DUPLICATE_MID_SLOT"
  | "LEGACY_CLOSED_NO_CUSTOMER_CONSUMER"
  | "KEEP_LEGACY_OTHER";

export function resolvePostAdsAdTypeRole(adType: AdType | string): PostAdsAdTypeRole {
  const t = String(adType ?? "").trim();
  if (t === "top_fixed") return "LEGACY_READ_ONLY_COMMUNITY_PIN";
  if (t === "mid_insert") return "QUARANTINE_DUPLICATE_MID_SLOT";
  if (t === "highlight") return "LEGACY_CLOSED_NO_CUSTOMER_CONSUMER";
  return "KEEP_LEGACY_OTHER";
}

/** New member applies must not use post_ads writers (canonical = promotion-orders / feed ads). */
export function isPostAdsAdTypeOpenForNewApply(adType: AdType | string): boolean {
  const role = resolvePostAdsAdTypeRole(adType);
  return (
    role !== "QUARANTINE_DUPLICATE_MID_SLOT" &&
    role !== "LEGACY_READ_ONLY_COMMUNITY_PIN" &&
    role !== "LEGACY_CLOSED_NO_CUSTOMER_CONSUMER"
  );
}

/** Hint for 410 body — keep clients from guessing wrong replacement path. */
export function postAdsClosedApplyHint(adType: AdType | string): string {
  const t = String(adType ?? "").trim();
  if (t === "top_fixed") return "community_paid_exposure_via_promotion_orders";
  if (t === "mid_insert") return "mid_insert_replaced_by_admin_feed_ads";
  if (t === "highlight") return "highlight_no_customer_consumer_use_canonical_boost_or_feed_banner";
  return "ad_type_closed";
}
