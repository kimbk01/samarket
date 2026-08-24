/**
 * CUT 4 — STORE_PAID_AD runtime exposure resolver (ONE authority).
 * Consumes CUT 0 `deriveStoresDiscoveryPaidAdExposureState` — no parallel eligibility math.
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

export type StorePaidAdExposureResolveInput = {
  campaign: StorePaidAdCampaignRow;
  nowMs: number;
  /** Expected placement for this surface (`stores_home` | `stores_browse`). */
  targetPlacement: StorePaidAdPlacement;
  /** rest_stores ad_integration / browse ad_enabled / legacy homePaidAdInsertion → surfaceAllowsPaidAd */
  surfaceAllowed: boolean;
  storeEligible: boolean;
  /**
   * HOME: store in discovery feed pool (or true when no taxonomy on campaign).
   * BROWSE: store ∈ organic candidate set (taxonomy scope proxy until campaign taxonomy columns exist).
   */
  taxonomyScopeMatched: boolean;
};

export type StorePaidAdCampaignExposureResult = StoresDiscoveryPaidAdExposureState & {
  campaignId: string;
  storeId: string;
  placement: StorePaidAdPlacement;
};

function windowActive(row: StorePaidAdCampaignRow, nowMs: number): boolean {
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

/** Map campaign + surface facts → ONE exposure state (CUT 0 factors). */
export function resolveStorePaidAdCampaignExposure(
  input: StorePaidAdExposureResolveInput
): StorePaidAdCampaignExposureResult {
  const { campaign } = input;
  const state = deriveStoresDiscoveryPaidAdExposureState({
    campaignActive: campaign.isActive === true,
    windowActive: windowActive(campaign, input.nowMs),
    storeEligible: input.storeEligible === true,
    placementMatched: campaign.placement === input.targetPlacement,
    taxonomyScopeMatched: input.taxonomyScopeMatched === true,
    surfaceAllowed: input.surfaceAllowed === true,
  });
  return {
    ...state,
    campaignId: campaign.id,
    storeId: campaign.storeId,
    placement: campaign.placement,
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
 * Callers supply surfaceAllowed / taxonomy / storeEligible — not re-checked elsewhere.
 */
export function selectExposureEligibleStorePaidAds(input: {
  campaigns: readonly StorePaidAdCampaignRow[];
  nowMs?: number;
  targetPlacement: StorePaidAdPlacement;
  surfaceAllowed: boolean;
  /** storeId → eligible; default true when map omitted */
  storeEligibleById?: ReadonlyMap<string, boolean> | null;
  /** storeId → taxonomy match; default false when map omitted (fail closed) */
  taxonomyMatchedStoreIds: ReadonlySet<string>;
}): StorePaidAdExposureBatchResult {
  const nowMs = input.nowMs ?? Date.now();
  const eligible: StorePaidAdCampaignRow[] = [];
  const blocked: StorePaidAdExposureBatchResult["blocked"] = [];

  for (const campaign of input.campaigns) {
    const storeEligible =
      input.storeEligibleById == null
        ? true
        : input.storeEligibleById.get(campaign.storeId) === true;
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
  return { eligible, blocked };
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
