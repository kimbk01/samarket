/**
 * Stores A — paid ad placement authority (NOT feed_ad_campaigns / NOT store_discovery_campaigns).
 *
 * CUT A HARD LOCK:
 * store_paid_ad_campaigns = STORE_PAID_AD = store_sponsored = paid list placement campaign.
 * FORBIDDEN: banner · coupon · editorial · fee promo · organic ranking boost.
 *
 * DB placement strings (stores_home | stores_browse) are unchanged.
 * Canonical app placements: stores_home_feed | stores_category_feed
 * @see lib/stores/advertising
 */

import { STORE_SPONSORED_CAMPAIGN_TABLE } from "@/lib/stores/advertising/delivery-ad-domain";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { OwnerStoreSponsoredInventoryKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export const STORE_PAID_AD_CAMPAIGN_TABLE = STORE_SPONSORED_CAMPAIGN_TABLE;

export const STORE_PAID_AD_PLACEMENTS = ["stores_home", "stores_browse"] as const;
export type StorePaidAdPlacement = (typeof STORE_PAID_AD_PLACEMENTS)[number];

export type StorePaidAdCampaignRow = {
  id: string;
  storeId: string;
  placement: StorePaidAdPlacement;
  title: string;
  headline: string;
  bodyCopy: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  /** CUT D — canonical when present; legacy rows may omit. */
  lifecycleStatus?: DeliveryAdLifecycleStatus;
  reviewStatus?: DeliveryAdReviewStatus;
  inventoryKeys?: OwnerStoreSponsoredInventoryKey[];
};

export function isStorePaidAdPlacement(value: unknown): value is StorePaidAdPlacement {
  return value === "stores_home" || value === "stores_browse";
}

export function isStorePaidAdCampaignActive(
  row: Pick<StorePaidAdCampaignRow, "isActive" | "startAt" | "endAt">,
  nowMs: number = Date.now()
): boolean {
  if (!row.isActive) return false;
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

export function compareStorePaidAdCampaigns(
  a: Pick<StorePaidAdCampaignRow, "id" | "startAt" | "endAt">,
  b: Pick<StorePaidAdCampaignRow, "id" | "startAt" | "endAt">
): number {
  const aEnd = Date.parse(a.endAt);
  const bEnd = Date.parse(b.endAt);
  if (aEnd !== bEnd) return aEnd - bEnd;
  const aStart = Date.parse(a.startAt);
  const bStart = Date.parse(b.startAt);
  if (aStart !== bStart) return bStart - aStart;
  return a.id.localeCompare(b.id);
}

export function selectActiveStorePaidAdCampaigns(
  rows: readonly StorePaidAdCampaignRow[],
  placement: StorePaidAdPlacement,
  nowMs: number = Date.now()
): StorePaidAdCampaignRow[] {
  return rows
    .filter((r) => r.placement === placement && isStorePaidAdCampaignActive(r, nowMs))
    .sort(compareStorePaidAdCampaigns);
}
