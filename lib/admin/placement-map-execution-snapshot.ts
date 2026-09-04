/**
 * CUT I — Placement Map ACTIVE / eligibility factors (read-only adapter).
 * Consumes Admin campaign detail + funding + sponsored gate pure functions.
 * No new placement authority / DB.
 */

import {
  evaluateStoreSponsoredCampaignGates,
  type StoreSponsoredExposureSurface,
  type StoreSponsoredRuntimeCampaign,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { isDeliveryBannerCreativeAssetReady } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import {
  DELIVERY_AD_INVENTORY_KEYS,
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import type { StorePaidAdPlacement } from "@/lib/stores/store-paid-ad-campaign-authority";

function asInventoryKey(raw: string): DeliveryAdInventoryKey | null {
  return (DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(raw)
    ? (raw as DeliveryAdInventoryKey)
    : null;
}
export type PlacementMapExecutionSnapshot = {
  campaignId: string;
  productKind: string;
  storeId: string | null;
  lifecycleStatus: string;
  reviewStatus: string;
  fundingStatus: DeliveryAdFundingStatus | "UNKNOWN";
  inventoryKeys: string[];
  creativeId: string | null;
  creativeAssetPath: string | null;
  creativeReady: boolean;
  startAt: string;
  endAt: string;
  scheduleActive: boolean;
  campaignSource: string | null;
  ctaHref: string | null;
  placementEnabled: boolean;
  /** Campaign-side gate only — store organic eligibility is app-runtime. */
  campaignGateOk: boolean | null;
  campaignGateReasons: string[];
  surface: StoreSponsoredExposureSurface | null;
  notes: string[];
};

function inventoryToSurface(keys: string[]): StoreSponsoredExposureSurface | null {
  if (keys.includes("STORES_HOME_FEED")) return "STORES_HOME_FEED";
  if (keys.includes("STORES_CATEGORY_FEED")) return "STORES_CATEGORY_FEED";
  return null;
}

function legacyPlacement(keys: string[]): StorePaidAdPlacement {
  if (keys.includes("STORES_HOME_FEED") || keys.includes("STORES_HOME_HERO")) {
    return "stores_home";
  }
  return "stores_browse";
}

export function buildPlacementMapExecutionSnapshot(input: {
  campaign: {
    id: string;
    productKind: string;
    storeId: string | null;
    lifecycleStatus: string;
    reviewStatus: string;
    inventoryKeys: string[];
    creativeId: string | null;
    imageUrl: string | null;
    startAt: string;
    endAt: string;
    campaignSource?: string | null;
    ctaHref?: string | null;
    title?: string | null;
    headline?: string | null;
  };
  creativeAssetPath?: string | null;
  fundingStatus?: DeliveryAdFundingStatus | null;
  focusPlacementId?: string | null;
  nowMs?: number;
}): PlacementMapExecutionSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const keys = input.campaign.inventoryKeys ?? [];
  const focus = String(input.focusPlacementId ?? "").trim();
  const asset =
    String(input.creativeAssetPath ?? "").trim() ||
    String(input.campaign.imageUrl ?? "").trim() ||
    null;
  const creativeReady =
    input.campaign.productKind === "banner"
      ? isDeliveryBannerCreativeAssetReady(asset)
      : Boolean(asset);

  const placementKey =
    (focus && keys.includes(focus) ? focus : keys[0]) || focus || "";
  const invKey = asInventoryKey(placementKey);
  const placementEnabled = invKey
    ? isRuntimeActiveInventory(invKey)
    : keys.some((k) => {
        const ik = asInventoryKey(k);
        return ik ? isRuntimeActiveInventory(ik) : false;
      });

  const startMs = Date.parse(input.campaign.startAt);
  const endMs = Date.parse(input.campaign.endAt);
  const scheduleActive =
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs &&
    startMs <= nowMs &&
    endMs > nowMs;

  const fundingStatus = input.fundingStatus ?? "UNKNOWN";
  const surface = inventoryToSurface(keys);
  const notes: string[] = [
    "store_eligible / taxonomy / surface_allowed require Delivery organic runtime — not invented here",
  ];

  let campaignGateOk: boolean | null = null;
  let campaignGateReasons: string[] = [];

  if (input.campaign.productKind === "store_sponsored" && surface) {
    const runtimeCampaign: StoreSponsoredRuntimeCampaign = {
      id: input.campaign.id,
      storeId: String(input.campaign.storeId ?? ""),
      placement: legacyPlacement(keys),
      title: String(input.campaign.title ?? ""),
      headline: String(input.campaign.headline ?? ""),
      bodyCopy: null,
      imageUrl: asset,
      startAt: input.campaign.startAt,
      endAt: input.campaign.endAt,
      isActive: input.campaign.lifecycleStatus === "ACTIVE",
      lifecycleStatus: input.campaign.lifecycleStatus as StoreSponsoredRuntimeCampaign["lifecycleStatus"],
      reviewStatus: input.campaign.reviewStatus as StoreSponsoredRuntimeCampaign["reviewStatus"],
      inventoryKeys: keys as StoreSponsoredRuntimeCampaign["inventoryKeys"],
      campaignSource: input.campaign.campaignSource,
      fundingStatus: fundingStatus === "UNKNOWN" ? null : fundingStatus,
    };
    const gate = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign,
      surface,
      nowMs,
    });
    campaignGateOk = gate.ok;
    campaignGateReasons = gate.reasons;
  } else if (input.campaign.productKind === "banner") {
    const reasons: string[] = [];
    if (input.campaign.lifecycleStatus !== "ACTIVE") reasons.push("campaign_ACTIVE");
    if (input.campaign.reviewStatus !== "APPROVED") reasons.push("review_approved");
    if (!scheduleActive) reasons.push("schedule_active");
    if (!creativeReady) reasons.push("creative_ready");
    if (fundingStatus !== "FUNDED" && input.campaign.campaignSource !== "DIBAY_FIRST_PARTY") {
      reasons.push("funding_ready");
    }
    campaignGateOk = reasons.length === 0;
    campaignGateReasons = reasons;
    notes.push("banner gates use Admin read fields + creative readiness (no new authority)");
  } else {
    notes.push("campaign-side gate N/A for this product/inventory combination");
  }

  return {
    campaignId: input.campaign.id,
    productKind: input.campaign.productKind,
    storeId: input.campaign.storeId,
    lifecycleStatus: input.campaign.lifecycleStatus,
    reviewStatus: input.campaign.reviewStatus,
    fundingStatus,
    inventoryKeys: keys,
    creativeId: input.campaign.creativeId,
    creativeAssetPath: asset,
    creativeReady,
    startAt: input.campaign.startAt,
    endAt: input.campaign.endAt,
    scheduleActive,
    campaignSource: input.campaign.campaignSource ?? null,
    ctaHref: input.campaign.ctaHref ?? null,
    placementEnabled,
    campaignGateOk,
    campaignGateReasons,
    surface,
    notes,
  };
}
