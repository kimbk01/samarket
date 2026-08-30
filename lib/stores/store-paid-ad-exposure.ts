/**
 * CUT 4 + CUT D — STORE_PAID_AD runtime exposure resolver (ONE authority).
 *
 * CUT D: storeEligibleById null → NEVER default true (fail-closed).
 * Lifecycle + review + inventory gates via store-sponsored-exposure-eligibility.
 */

import { deriveStoresDiscoveryPaidAdExposureState } from "@/lib/stores/discovery-authority/paid-exposure-state";
import type {
  StoresDiscoveryPaidAdBlockingReason,
  StoresDiscoveryPaidAdExposureState,
} from "@/lib/stores/discovery-authority/paid-exposure-state";
import {
  compareStorePaidAdCampaigns,
  type StorePaidAdCampaignRow,
  type StorePaidAdPlacement,
} from "@/lib/stores/store-paid-ad-campaign-authority";
import {
  dedupeSponsoredCampaignsOnePerStore,
  evaluateStoreSponsoredCampaignGates,
  placementToSponsoredSurface,
  type StoreSponsoredRuntimeCampaign,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import type { OwnerStoreSponsoredInventoryKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";

export type StorePaidAdExposureResolveInput = {
  campaign: StorePaidAdCampaignRow;
  nowMs: number;
  targetPlacement: StorePaidAdPlacement;
  surfaceAllowed: boolean;
  storeEligible: boolean;
  taxonomyScopeMatched: boolean;
};

export type StorePaidAdCampaignExposureResult = StoresDiscoveryPaidAdExposureState & {
  campaignId: string;
  storeId: string;
  placement: StorePaidAdPlacement;
  cutDReasons?: string[];
};

function toRuntimeCampaign(campaign: StorePaidAdCampaignRow): StoreSponsoredRuntimeCampaign {
  const lifecycleStatus: DeliveryAdLifecycleStatus =
    campaign.lifecycleStatus ?? (campaign.isActive ? "ACTIVE" : "ENDED");
  const reviewStatus: DeliveryAdReviewStatus =
    campaign.reviewStatus ?? (campaign.isActive ? "APPROVED" : "NOT_SUBMITTED");
  const inventoryKeys: OwnerStoreSponsoredInventoryKey[] =
    campaign.inventoryKeys && campaign.inventoryKeys.length > 0
      ? campaign.inventoryKeys
      : campaign.placement === "stores_home"
        ? ["STORES_HOME_FEED"]
        : ["STORES_CATEGORY_FEED"];
  return {
    id: campaign.id,
    storeId: campaign.storeId,
    placement: campaign.placement,
    title: campaign.title,
    headline: campaign.headline,
    bodyCopy: campaign.bodyCopy,
    imageUrl: campaign.imageUrl,
    startAt: campaign.startAt,
    endAt: campaign.endAt,
    isActive: campaign.isActive,
    lifecycleStatus,
    reviewStatus,
    inventoryKeys,
    campaignSource: campaign.campaignSource ?? "OWNER_PAID",
    fundingStatus: campaign.fundingStatus ?? "UNFUNDED",
  };
}

function windowActive(row: StorePaidAdCampaignRow, nowMs: number): boolean {
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

/** Map campaign + surface facts → ONE exposure state. */
export function resolveStorePaidAdCampaignExposure(
  input: StorePaidAdExposureResolveInput
): StorePaidAdCampaignExposureResult {
  const runtime = toRuntimeCampaign(input.campaign);
  const surface = placementToSponsoredSurface(input.targetPlacement);
  const cutD = evaluateStoreSponsoredCampaignGates({
    campaign: runtime,
    surface,
    nowMs: input.nowMs,
  });

  const campaignActive =
    runtime.lifecycleStatus === "ACTIVE" && runtime.reviewStatus === "APPROVED";
  const placementMatched =
    input.campaign.placement === input.targetPlacement &&
    !cutD.reasons.includes("inventory_match");

  const state = deriveStoresDiscoveryPaidAdExposureState({
    campaignActive,
    windowActive: windowActive(input.campaign, input.nowMs) && !cutD.reasons.includes("schedule_active"),
    storeEligible: input.storeEligible === true,
    placementMatched,
    taxonomyScopeMatched: input.taxonomyScopeMatched === true,
    surfaceAllowed: input.surfaceAllowed === true,
  });

  return {
    ...state,
    campaignId: input.campaign.id,
    storeId: input.campaign.storeId,
    placement: input.campaign.placement,
    cutDReasons: cutD.reasons,
  };
}

export type StorePaidAdExposureBatchResult = {
  eligible: StorePaidAdCampaignRow[];
  blocked: Array<{
    campaign: StorePaidAdCampaignRow;
    blockingReasons: StoresDiscoveryPaidAdBlockingReason[];
  }>;
};

/**
 * Filter + deterministic order for insertion.
 * CUT D: storeEligibleById null/omitted → fail-closed (all stores ineligible).
 */
export function selectExposureEligibleStorePaidAds(input: {
  campaigns: readonly StorePaidAdCampaignRow[];
  nowMs?: number;
  targetPlacement: StorePaidAdPlacement;
  surfaceAllowed: boolean;
  /**
   * storeId → eligible. REQUIRED for exposure.
   * null/undefined = fail-closed empty eligibility (CUT D removed null→true).
   */
  storeEligibleById?: ReadonlyMap<string, boolean> | null;
  taxonomyMatchedStoreIds: ReadonlySet<string>;
}): StorePaidAdExposureBatchResult {
  const nowMs = input.nowMs ?? Date.now();
  const eligible: StorePaidAdCampaignRow[] = [];
  const blocked: StorePaidAdExposureBatchResult["blocked"] = [];
  const eligibilityMap = input.storeEligibleById;

  for (const campaign of input.campaigns) {
    const storeEligible =
      eligibilityMap == null ? false : eligibilityMap.get(campaign.storeId) === true;
    const taxonomyScopeMatched = input.taxonomyMatchedStoreIds.has(campaign.storeId);
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign,
      nowMs,
      targetPlacement: input.targetPlacement,
      surfaceAllowed: input.surfaceAllowed,
      storeEligible,
      taxonomyScopeMatched,
    });
    if (exposure.actualExposureEligible) {
      eligible.push(campaign);
    } else {
      blocked.push({ campaign, blockingReasons: exposure.blockingReasons });
    }
  }

  eligible.sort(compareStorePaidAdCampaigns);
  const deduped = dedupeSponsoredCampaignsOnePerStore(eligible, compareStorePaidAdCampaigns);
  return { eligible: deduped, blocked };
}

/** HOME rest_stores surfaceAllowsPaidAd — ad_integration on rest OR legacy homePaidAdInsertion.enabled */
export function resolveHomeRestPaidSurfaceAllowed(input: {
  restShelfAdIntegration: string | null | undefined;
  homePaidAdInsertionEnabled: boolean;
}): boolean {
  const integration = String(input.restShelfAdIntegration ?? "off").trim();
  if (integration && integration !== "off") return true;
  return input.homePaidAdInsertionEnabled === true;
}
