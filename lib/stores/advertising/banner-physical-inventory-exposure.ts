/**
 * Stage 2 — Banner exposure for composition-owned physical inventories
 * (HOME INLINE / BROWSE TOP). Reuses funding + creative readiness SSOT.
 * Does NOT use native store insertion planner.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdReviewStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import { isSponsoredScheduleActive } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import {
  isDeliveryBannerCreativeAssetReady,
  isDeliveryBannerDestinationReady,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import {
  isDeliveryAdFundingReadyForGoLive,
  resolveDeliveryAdFundingStatus,
  type DeliveryAdFundingStatus,
} from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { stage2PhysicalBannerExposureAllowed } from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";

export type BannerPhysicalExposureCampaign = {
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
  campaignSource?: string | null;
  fundingStatus?: DeliveryAdFundingStatus | null;
};

export function evaluateBannerPhysicalInventoryExposure(input: {
  campaign: BannerPhysicalExposureCampaign;
  inventoryKey: DeliveryAdInventoryKey;
  physicalEnabled: boolean;
  commercialSellable?: boolean;
  nowMs: number;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const c = input.campaign;
  const key = input.inventoryKey;

  if (
    !stage2PhysicalBannerExposureAllowed({
      physicalEnabled: input.physicalEnabled,
      commercialSellable: input.commercialSellable !== false,
      campaignEligible: true,
    })
  ) {
    reasons.push("physical_disabled");
  }

  if (c.lifecycleStatus !== "ACTIVE") reasons.push("campaign_ACTIVE");
  if (c.reviewStatus !== "APPROVED") reasons.push("review_approved");
  if (!isSponsoredScheduleActive(c.startAt, c.endAt, input.nowMs)) {
    reasons.push("schedule_active");
  }
  if (!c.inventoryKeys.includes(key)) reasons.push("inventory_match");
  if (!isRuntimeActiveInventory(key)) reasons.push("inventory_active");

  const asset = String(c.creativeAssetPath ?? "").trim();
  if (!asset) reasons.push("creative_asset");
  else if (!isDeliveryBannerCreativeAssetReady(asset)) reasons.push("creative_not_ready");
  if (!isDeliveryBannerDestinationReady(c.ctaHref)) reasons.push("destination_not_ready");
  if (c.creativeReviewStatus != null && c.creativeReviewStatus !== "APPROVED") {
    reasons.push("creative_approved");
  }
  if (
    !isDeliveryAdFundingReadyForGoLive({
      campaignSource: c.campaignSource,
      fundingStatus: resolveDeliveryAdFundingStatus({ rowStatus: c.fundingStatus }),
    })
  ) {
    reasons.push("funding_ready");
  }

  void c.storeId;
  return { ok: reasons.length === 0, reasons };
}
