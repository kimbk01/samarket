/**
 * CUT J — Banner SEARCH_TOP exposure eligibility.
 * Organic search ranking is never an input. Relevance = advertised store ∈ organic store ids.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdReviewStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { isRuntimeActiveInventory } from "@/lib/stores/advertising/delivery-ad-inventory";
import { isSponsoredScheduleActive } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";

export type BannerSearchTopExposureCampaign = {
  id: string;
  storeId: string | null;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  startAt: string;
  endAt: string;
  inventoryKeys: string[];
  creativeAssetPath: string | null;
  creativeReviewStatus: DeliveryAdReviewStatus | null;
  ctaHref: string;
};

/**
 * Search slot policy: one top banner above organic results when organic stores exist.
 * Empty query / zero organic stores → no insertion (caller must not invoke).
 */
export const STORES_SEARCH_TOP_SLOT_POLICY = {
  inventoryKey: "STORES_SEARCH_TOP" as const,
  position: "above_organic_store_results" as const,
  maxBanners: 1,
  requireNonEmptyQuery: true,
  requireOrganicStoreResults: true,
  relevance: "advertised_store_in_organic_store_ids" as const,
  note: "No paid keyword auction. Fail-closed when organic stores empty.",
} as const;

export function evaluateBannerSearchTopExposure(input: {
  campaign: BannerSearchTopExposureCampaign;
  organicStoreIds: readonly string[];
  nowMs: number;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const c = input.campaign;

  if (c.lifecycleStatus !== "ACTIVE") reasons.push("campaign_ACTIVE");
  if (c.reviewStatus !== "APPROVED") reasons.push("review_approved");
  if (!isSponsoredScheduleActive(c.startAt, c.endAt, input.nowMs)) {
    reasons.push("schedule_active");
  }
  if (!c.inventoryKeys.includes("STORES_SEARCH_TOP")) reasons.push("inventory_match");
  if (!isRuntimeActiveInventory("STORES_SEARCH_TOP")) reasons.push("inventory_active");

  const asset = String(c.creativeAssetPath ?? "").trim();
  if (!asset) reasons.push("creative_asset");
  if (c.creativeReviewStatus != null && c.creativeReviewStatus !== "APPROVED") {
    reasons.push("creative_approved");
  }

  const storeId = String(c.storeId ?? "").trim();
  if (!storeId) reasons.push("store_id");
  else if (!input.organicStoreIds.includes(storeId)) {
    reasons.push("search_relevance");
  }

  void c.ctaHref;
  return { ok: reasons.length === 0, reasons };
}

/** Compose: pick first eligible by sort order; never mutates organic list. */
export function selectSearchTopBannerCampaign<T extends BannerSearchTopExposureCampaign>(
  campaigns: readonly T[],
  organicStoreIds: readonly string[],
  nowMs: number
): T | null {
  if (!organicStoreIds.length) return null;
  for (const c of campaigns) {
    if (evaluateBannerSearchTopExposure({ campaign: c, organicStoreIds, nowMs }).ok) {
      return c;
    }
  }
  return null;
}
