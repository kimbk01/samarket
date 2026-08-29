/**
 * CUT D — Canonical Store Sponsored exposure eligibility (HOME/CATEGORY feed).
 *
 * Organic ranking NEVER receives paid campaign input.
 * BUDGET_GATE = NOT_IMPLEMENTED (CUT H) — not a fake PASS.
 */

import {
  OWNER_INVENTORY_TO_LEGACY_PLACEMENT,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { StorePaidAdPlacement } from "@/lib/stores/store-paid-ad-campaign-authority";
import { isStorePaidAdPlacement } from "@/lib/stores/store-paid-ad-campaign-authority";
import { isRuntimeActiveInventory } from "@/lib/stores/advertising/delivery-ad-inventory";

export const STORE_SPONSORED_BUDGET_GATE = {
  status: "NOT_IMPLEMENTED" as const,
  cut: "H",
  note: "No fake budget available PASS — billing is CUT H",
};

export const STORE_ELIGIBILITY_CUT_D_STATUS = {
  status: "WIRED" as const,
  nullToTrueFallback: "REMOVED" as const,
  authority:
    "organic Delivery candidate pool (approval/visibility/serviceability already applied) + campaign lifecycle/review/schedule/inventory",
} as const;

export type StoreSponsoredRuntimeCampaign = {
  id: string;
  storeId: string;
  /** Legacy placement — compatibility only; inventoryKeys are canonical. */
  placement: StorePaidAdPlacement;
  title: string;
  headline: string;
  bodyCopy: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  /** Legacy sync field — lifecycle is canonical for exposure. */
  isActive: boolean;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  inventoryKeys: OwnerStoreSponsoredInventoryKey[];
};

export type StoreSponsoredExposureSurface = "STORES_HOME_FEED" | "STORES_CATEGORY_FEED";

export const SURFACE_TO_REQUIRED_INVENTORY: Record<
  StoreSponsoredExposureSurface,
  OwnerStoreSponsoredInventoryKey
> = {
  STORES_HOME_FEED: "STORES_HOME_FEED",
  STORES_CATEGORY_FEED: "STORES_CATEGORY_FEED",
};

export function placementToSponsoredSurface(
  placement: StorePaidAdPlacement
): StoreSponsoredExposureSurface {
  return placement === "stores_home" ? "STORES_HOME_FEED" : "STORES_CATEGORY_FEED";
}

export function sponsoredSurfaceToPlacement(
  surface: StoreSponsoredExposureSurface
): StorePaidAdPlacement {
  return OWNER_INVENTORY_TO_LEGACY_PLACEMENT[SURFACE_TO_REQUIRED_INVENTORY[surface]];
}

/** Schedule: start <= now < end (end exclusive at exact end instant via endMs > now). */
export function isSponsoredScheduleActive(
  startAt: string,
  endAt: string,
  nowMs: number
): boolean {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

export type StoreSponsoredExposureGateResult = {
  ok: boolean;
  reasons: string[];
};

/**
 * Pure campaign-side gates (no store map). Used by batch selector + tests.
 */
export function evaluateStoreSponsoredCampaignGates(input: {
  campaign: StoreSponsoredRuntimeCampaign;
  surface: StoreSponsoredExposureSurface;
  nowMs: number;
}): StoreSponsoredExposureGateResult {
  const reasons: string[] = [];
  const { campaign, surface, nowMs } = input;

  if (campaign.lifecycleStatus !== "ACTIVE") reasons.push("campaign_ACTIVE");
  if (campaign.reviewStatus !== "APPROVED") reasons.push("review_approved");
  if (!isSponsoredScheduleActive(campaign.startAt, campaign.endAt, nowMs)) {
    reasons.push("schedule_active");
  }

  const required = SURFACE_TO_REQUIRED_INVENTORY[surface];
  const keys =
    campaign.inventoryKeys.length > 0
      ? campaign.inventoryKeys
      : legacyPlacementAsInventoryKeys(campaign.placement);

  if (!keys.includes(required)) reasons.push("inventory_match");
  if (!isRuntimeActiveInventory(required)) reasons.push("inventory_active");

  // Budget intentionally omitted — NOT_IMPLEMENTED
  void STORE_SPONSORED_BUDGET_GATE;

  return { ok: reasons.length === 0, reasons };
}

function legacyPlacementAsInventoryKeys(
  placement: StorePaidAdPlacement
): OwnerStoreSponsoredInventoryKey[] {
  if (placement === "stores_home") return ["STORES_HOME_FEED"];
  return ["STORES_CATEGORY_FEED"];
}

/**
 * Full exposure eligibility — storeEligible must come from organic/serviceability authority map.
 * Never defaults missing map entries to true.
 */
export function evaluateStoreSponsoredExposureEligibility(input: {
  campaign: StoreSponsoredRuntimeCampaign;
  surface: StoreSponsoredExposureSurface;
  nowMs: number;
  /** storeId → eligible in Delivery organic/serviceability universe */
  storeEligibleById: ReadonlyMap<string, boolean>;
  taxonomyScopeMatched: boolean;
  surfaceAllowed: boolean;
}): StoreSponsoredExposureGateResult {
  const reasons: string[] = [];
  const campaignGates = evaluateStoreSponsoredCampaignGates({
    campaign: input.campaign,
    surface: input.surface,
    nowMs: input.nowMs,
  });
  reasons.push(...campaignGates.reasons);

  if (input.storeEligibleById.get(input.campaign.storeId) !== true) {
    reasons.push("store_eligible");
  }
  if (!input.taxonomyScopeMatched) reasons.push("taxonomy_scope");
  if (!input.surfaceAllowed) reasons.push("surface_allowed");

  return { ok: reasons.length === 0, reasons };
}

/**
 * Build eligibility map from organic Delivery candidate ids.
 * Those ids already passed approval/visibility/delivery/serviceability for the surface.
 */
export function buildStoreSponsoredEligibilityMapFromOrganicPool(
  organicStoreIds: readonly string[]
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const id of organicStoreIds) {
    const sid = String(id ?? "").trim();
    if (sid) m.set(sid, true);
  }
  return m;
}

/** One store → at most one sponsored campaign per surface response (deterministic). */
export function dedupeSponsoredCampaignsOnePerStore<
  T extends { id: string; storeId: string; startAt: string; endAt: string },
>(campaigns: readonly T[], compare: (a: T, b: T) => number): T[] {
  const sorted = [...campaigns].sort(compare);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of sorted) {
    if (seen.has(c.storeId)) continue;
    seen.add(c.storeId);
    out.push(c);
  }
  return out;
}

export function asStorePaidAdPlacementOrNull(value: unknown): StorePaidAdPlacement | null {
  return isStorePaidAdPlacement(value) ? value : null;
}
