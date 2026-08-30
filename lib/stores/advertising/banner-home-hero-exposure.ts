/**
 * CUT E — Banner HOME HERO exposure eligibility (campaign→inventory→creative).
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdReviewStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { isRuntimeActiveInventory } from "@/lib/stores/advertising/delivery-ad-inventory";
import { isSponsoredScheduleActive } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import {
  isDeliveryBannerCreativeAssetReady,
  isDeliveryBannerDestinationReady,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";

export type BannerHeroExposureCampaign = {
  id: string;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  startAt: string;
  endAt: string;
  inventoryKeys: string[];
  creativeAssetPath: string | null;
  creativeReviewStatus: DeliveryAdReviewStatus | null;
  ctaHref: string;
  storeId: string | null;
};

export function evaluateBannerHomeHeroExposure(input: {
  campaign: BannerHeroExposureCampaign;
  nowMs: number;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const c = input.campaign;

  if (c.lifecycleStatus !== "ACTIVE") reasons.push("campaign_ACTIVE");
  if (c.reviewStatus !== "APPROVED") reasons.push("review_approved");
  if (!isSponsoredScheduleActive(c.startAt, c.endAt, input.nowMs)) {
    reasons.push("schedule_active");
  }
  if (!c.inventoryKeys.includes("STORES_HOME_HERO")) reasons.push("inventory_match");
  if (!isRuntimeActiveInventory("STORES_HOME_HERO")) reasons.push("inventory_active");

  const asset = String(c.creativeAssetPath ?? "").trim();
  if (!asset) reasons.push("creative_asset");
  else if (!isDeliveryBannerCreativeAssetReady(asset)) reasons.push("creative_not_ready");
  if (!isDeliveryBannerDestinationReady(c.ctaHref)) reasons.push("destination_not_ready");
  if (c.creativeReviewStatus != null && c.creativeReviewStatus !== "APPROVED") {
    reasons.push("creative_approved");
  }

  void c.storeId;

  return { ok: reasons.length === 0, reasons };
}
