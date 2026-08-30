/**
 * PRODUCT CUT 1 — Policy ↔ campaign count semantics (named metrics, never collapsed).
 *
 * linked         = inventory match (+ BROWSE taxonomy scope when provided)
 * exposable_now  = linked ∩ ACTIVE
 * under_review   = linked ∩ (SUBMITTED | UNDER_REVIEW | CHANGES_REQUESTED)
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";

export const POLICY_CAMPAIGN_UNDER_REVIEW_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
] as const satisfies ReadonlyArray<DeliveryAdLifecycleStatus>;

export type PolicyCampaignCountMetric = "linked" | "exposable_now" | "under_review";

export type PolicyCampaignCounts = {
  linked: number;
  exposable_now: number;
  under_review: number;
};

export type PolicyCampaignCountRow = {
  inventoryKeys: readonly string[];
  lifecycleStatus: DeliveryAdLifecycleStatus;
  /** Store primary category slug (BROWSE scope). */
  storePrimarySlug?: string | null;
  /** Store secondary topic slug (BROWSE scope). */
  storeSubSlug?: string | null;
};

export type PolicyCampaignCountFilter = {
  inventoryKey: string;
  /** When set, store must match this primary slug (BROWSE). */
  primarySlug?: string | null;
  /** When set (non-empty), store must match this sub slug. */
  subSlug?: string | null;
};

export function emptyPolicyCampaignCounts(): PolicyCampaignCounts {
  return { linked: 0, exposable_now: 0, under_review: 0 };
}

export function campaignMatchesInventory(
  row: PolicyCampaignCountRow,
  inventoryKey: string
): boolean {
  return row.inventoryKeys.includes(inventoryKey);
}

export function campaignMatchesBrowseTaxonomyScope(
  row: PolicyCampaignCountRow,
  primarySlug: string | null | undefined,
  subSlug: string | null | undefined
): boolean {
  const primary = primarySlug?.trim().toLowerCase() ?? "";
  if (!primary) return true;
  const storePrimary = (row.storePrimarySlug ?? "").trim().toLowerCase();
  if (storePrimary !== primary) return false;
  const sub = subSlug?.trim().toLowerCase() ?? "";
  if (!sub) return true;
  const storeSub = (row.storeSubSlug ?? "").trim().toLowerCase();
  return storeSub === sub;
}

export function isPolicyLinkedCampaign(
  row: PolicyCampaignCountRow,
  filter: PolicyCampaignCountFilter
): boolean {
  if (!campaignMatchesInventory(row, filter.inventoryKey)) return false;
  if (filter.inventoryKey === "STORES_CATEGORY_FEED") {
    return campaignMatchesBrowseTaxonomyScope(row, filter.primarySlug, filter.subSlug);
  }
  return true;
}

export function isPolicyExposableNow(lifecycle: DeliveryAdLifecycleStatus): boolean {
  return lifecycle === "ACTIVE";
}

export function isPolicyUnderReview(lifecycle: DeliveryAdLifecycleStatus): boolean {
  return (POLICY_CAMPAIGN_UNDER_REVIEW_STATUSES as readonly string[]).includes(lifecycle);
}

/** Bucket linked campaigns into the three named metrics. */
export function bucketPolicyCampaignCounts(
  rows: readonly PolicyCampaignCountRow[],
  filter: PolicyCampaignCountFilter
): PolicyCampaignCounts {
  const counts = emptyPolicyCampaignCounts();
  for (const row of rows) {
    if (!isPolicyLinkedCampaign(row, filter)) continue;
    counts.linked += 1;
    if (isPolicyExposableNow(row.lifecycleStatus)) counts.exposable_now += 1;
    if (isPolicyUnderReview(row.lifecycleStatus)) counts.under_review += 1;
  }
  return counts;
}
