/**
 * Philife `post_ads` authority vs Admin Feed Ads — semantic LOCK.
 * CONTRACT: docs/dibay-promotion-advertisement-product-contract.md
 *
 * FINAL ROLES:
 * - Member Trade Promotion → `point_promotion_orders` + purchase_member_content_promotion
 * - Admin Feed Advertisement → `feed_ad_campaigns` / `feed_ad_creatives` (mid-slot banners)
 * - Philife `post_ads` top_fixed → KEEP as Community **member paid content pin** (distinct UX)
 * - Philife `post_ads` mid_insert → QUARANTINED (same mid-slot purpose as Feed Ads; no new applies)
 * - Philife highlight → KEEP legacy product type for now (not Feed Ads carousel)
 */

import type { AdType } from "@/lib/ads/types";

export type PostAdsAdTypeRole =
  | "KEEP_COMMUNITY_MEMBER_PIN"
  | "QUARANTINE_DUPLICATE_MID_SLOT"
  | "KEEP_LEGACY_OTHER";

export function resolvePostAdsAdTypeRole(adType: AdType | string): PostAdsAdTypeRole {
  const t = String(adType ?? "").trim();
  if (t === "top_fixed") return "KEEP_COMMUNITY_MEMBER_PIN";
  if (t === "mid_insert") return "QUARANTINE_DUPLICATE_MID_SLOT";
  return "KEEP_LEGACY_OTHER";
}

/** New member applies must not sell mid_insert — Feed Ads owns mid-slot banners. */
export function isPostAdsAdTypeOpenForNewApply(adType: AdType | string): boolean {
  return resolvePostAdsAdTypeRole(adType) !== "QUARANTINE_DUPLICATE_MID_SLOT";
}
