/**
 * Philife `post_ads` authority vs Paid Exposure / Feed Ads — semantic LOCK.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 *
 * FINAL ROLES:
 * - Community member paid pin → `point_promotion_orders` (domain=community) — NEW WRITES
 * - Philife `post_ads` top_fixed → LEGACY READ ONLY (no new applies)
 * - Philife `post_ads` mid_insert → QUARANTINED (Feed Ads owns mid-slot)
 * - Admin Feed Advertisement → `feed_ad_campaigns`
 * - Member Trade Promotion → `point_promotion_orders` (domain=trade)
 */

import type { AdType } from "@/lib/ads/types";

export type PostAdsAdTypeRole =
  | "LEGACY_READ_ONLY_COMMUNITY_PIN"
  | "QUARANTINE_DUPLICATE_MID_SLOT"
  | "KEEP_LEGACY_OTHER";

export function resolvePostAdsAdTypeRole(adType: AdType | string): PostAdsAdTypeRole {
  const t = String(adType ?? "").trim();
  if (t === "top_fixed") return "LEGACY_READ_ONLY_COMMUNITY_PIN";
  if (t === "mid_insert") return "QUARANTINE_DUPLICATE_MID_SLOT";
  return "KEEP_LEGACY_OTHER";
}

/** New member applies must not use post_ads writers (canonical = promotion-orders). */
export function isPostAdsAdTypeOpenForNewApply(adType: AdType | string): boolean {
  const role = resolvePostAdsAdTypeRole(adType);
  return role !== "QUARANTINE_DUPLICATE_MID_SLOT" && role !== "LEGACY_READ_ONLY_COMMUNITY_PIN";
}
