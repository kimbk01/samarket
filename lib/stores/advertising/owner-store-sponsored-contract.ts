/**
 * CUT C — Owner Store Sponsored application contracts (validation + UI labels).
 * Pricing charge execution remains CUT H — no fake ₱0.
 */

import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdReviewStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { StorePaidAdPlacement } from "@/lib/stores/store-paid-ad-campaign-authority";
import { isStorePaidAdPlacement } from "@/lib/stores/store-paid-ad-campaign-authority";

/** ACTIVE store_sponsored inventories Owner may apply to. */
export const OWNER_STORE_SPONSORED_INVENTORY_KEYS = [
  "STORES_HOME_FEED",
  "STORES_CATEGORY_FEED",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type OwnerStoreSponsoredInventoryKey =
  (typeof OWNER_STORE_SPONSORED_INVENTORY_KEYS)[number];

export const OWNER_INVENTORY_TO_LEGACY_PLACEMENT = {
  STORES_HOME_FEED: "stores_home",
  STORES_CATEGORY_FEED: "stores_browse",
} as const satisfies Record<OwnerStoreSponsoredInventoryKey, StorePaidAdPlacement>;

export const DELIVERY_AD_OWNER_PRICING_PRODUCT = {
  status: "NOT_CONFIGURED" as const,
  chargeCollection: false,
  note: "Launch pricing strategy not configured — CUT H; pricing_model stays null",
};

export function isOwnerStoreSponsoredInventoryKey(
  value: unknown
): value is OwnerStoreSponsoredInventoryKey {
  return (
    typeof value === "string" &&
    (OWNER_STORE_SPONSORED_INVENTORY_KEYS as readonly string[]).includes(value)
  );
}

export function inventoryKeysToPrimaryPlacement(
  keys: readonly OwnerStoreSponsoredInventoryKey[]
): StorePaidAdPlacement | null {
  const first = keys[0];
  if (!first) return null;
  return OWNER_INVENTORY_TO_LEGACY_PLACEMENT[first];
}

export type OwnerStoreSponsoredScheduleInput = {
  startAtIso: string;
  endAtIso: string;
  nowMs?: number;
};

export type OwnerStoreSponsoredScheduleError =
  | "invalid_start_at"
  | "invalid_end_at"
  | "end_before_start"
  | "start_in_past";

/** Dates: end > start; start not before start-of-today (UTC day floor for contract tests; API passes now). */
export function validateOwnerStoreSponsoredSchedule(
  input: OwnerStoreSponsoredScheduleInput
): { ok: true; startAt: string; endAt: string } | { ok: false; error: OwnerStoreSponsoredScheduleError } {
  const startMs = Date.parse(input.startAtIso);
  const endMs = Date.parse(input.endAtIso);
  if (!Number.isFinite(startMs)) return { ok: false, error: "invalid_start_at" };
  if (!Number.isFinite(endMs)) return { ok: false, error: "invalid_end_at" };
  if (endMs <= startMs) return { ok: false, error: "end_before_start" };
  const nowMs = input.nowMs ?? Date.now();
  // Allow same calendar day: compare against start of current UTC minute − 60s slack for clock skew
  if (startMs < nowMs - 60_000) return { ok: false, error: "start_in_past" };
  return {
    ok: true,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
  };
}

export function validateOwnerInventorySelection(
  raw: unknown
):
  | { ok: true; keys: OwnerStoreSponsoredInventoryKey[] }
  | { ok: false; error: "no_inventory" | "invalid_inventory" } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "no_inventory" };
  const keys: OwnerStoreSponsoredInventoryKey[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isOwnerStoreSponsoredInventoryKey(item)) return { ok: false, error: "invalid_inventory" };
    if (seen.has(item)) continue;
    seen.add(item);
    keys.push(item);
  }
  if (!keys.length) return { ok: false, error: "no_inventory" };
  for (const k of keys) {
    if (!(ACTIVE_DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(k)) {
      return { ok: false, error: "invalid_inventory" };
    }
  }
  return { ok: true, keys };
}

export type OwnerStoreAdEligibility = {
  approvalStatus: string;
  isVisible: boolean;
};

export function isStoreEligibleForOwnerAdApplication(
  store: OwnerStoreAdEligibility
): boolean {
  if (store.approvalStatus !== "approved") return false;
  if (store.isVisible !== true) return false;
  return true;
}

export type OwnerAdsStatusI18nKey =
  | "owner_ads_status_draft"
  | "owner_ads_status_submitted"
  | "owner_ads_status_under_review"
  | "owner_ads_status_changes_requested"
  | "owner_ads_status_approved"
  | "owner_ads_status_scheduled"
  | "owner_ads_status_active"
  | "owner_ads_status_paused_owner"
  | "owner_ads_status_paused_admin"
  | "owner_ads_status_exhausted"
  | "owner_ads_status_rejected"
  | "owner_ads_status_ended"
  | "owner_ads_status_terminated"
  | "owner_ads_status_archived";

export type OwnerAdsReviewI18nKey =
  | "owner_ads_review_not_submitted"
  | "owner_ads_review_pending"
  | "owner_ads_review_in_review"
  | "owner_ads_review_changes_requested"
  | "owner_ads_review_approved"
  | "owner_ads_review_rejected";

export type OwnerAdsInventoryI18nKey =
  | "owner_ads_inventory_home"
  | "owner_ads_inventory_category";

/** i18n key for lifecycle status (Owner-facing). */
export function ownerLifecycleStatusI18nKey(
  status: DeliveryAdLifecycleStatus
): OwnerAdsStatusI18nKey {
  const map: Record<DeliveryAdLifecycleStatus, OwnerAdsStatusI18nKey> = {
    DRAFT: "owner_ads_status_draft",
    SUBMITTED: "owner_ads_status_submitted",
    UNDER_REVIEW: "owner_ads_status_under_review",
    CHANGES_REQUESTED: "owner_ads_status_changes_requested",
    APPROVED: "owner_ads_status_approved",
    SCHEDULED: "owner_ads_status_scheduled",
    ACTIVE: "owner_ads_status_active",
    PAUSED_OWNER: "owner_ads_status_paused_owner",
    PAUSED_ADMIN: "owner_ads_status_paused_admin",
    EXHAUSTED: "owner_ads_status_exhausted",
    REJECTED: "owner_ads_status_rejected",
    ENDED: "owner_ads_status_ended",
    TERMINATED: "owner_ads_status_terminated",
    ARCHIVED: "owner_ads_status_archived",
  };
  return map[status];
}

export function ownerReviewStatusI18nKey(
  status: DeliveryAdReviewStatus
): OwnerAdsReviewI18nKey {
  const map: Record<DeliveryAdReviewStatus, OwnerAdsReviewI18nKey> = {
    NOT_SUBMITTED: "owner_ads_review_not_submitted",
    PENDING: "owner_ads_review_pending",
    IN_REVIEW: "owner_ads_review_in_review",
    CHANGES_REQUESTED: "owner_ads_review_changes_requested",
    APPROVED: "owner_ads_review_approved",
    REJECTED: "owner_ads_review_rejected",
  };
  return map[status];
}

export function ownerInventoryI18nKey(
  key: OwnerStoreSponsoredInventoryKey
): OwnerAdsInventoryI18nKey {
  if (key === "STORES_HOME_FEED") return "owner_ads_inventory_home";
  return "owner_ads_inventory_category";
}

export type OwnerCampaignAction =
  | "submit"
  | "resubmit"
  | "pause"
  | "resume"
  | "end"
  | "delete";

export function ownerActionTargetLifecycle(
  action: OwnerCampaignAction
): DeliveryAdLifecycleStatus | null {
  switch (action) {
    case "submit":
    case "resubmit":
      return "SUBMITTED";
    case "pause":
      return "PAUSED_OWNER";
    case "resume":
      return "ACTIVE";
    case "end":
      return "ENDED";
    case "delete":
      return null;
    default:
      return null;
  }
}

export function placementToOwnerInventoryKey(
  placement: string
): OwnerStoreSponsoredInventoryKey | null {
  if (!isStorePaidAdPlacement(placement)) return null;
  if (placement === "stores_home") return "STORES_HOME_FEED";
  return "STORES_CATEGORY_FEED";
}

export const OWNER_ADS_SUMMARY_BUCKETS = [
  "under_review",
  "scheduled",
  "active",
  "paused",
  "ended",
] as const;
export type OwnerAdsSummaryBucket = (typeof OWNER_ADS_SUMMARY_BUCKETS)[number];

export function lifecycleToOwnerSummaryBucket(
  status: DeliveryAdLifecycleStatus
): OwnerAdsSummaryBucket | null {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "CHANGES_REQUESTED":
      return "under_review";
    case "APPROVED":
    case "SCHEDULED":
      return "scheduled";
    case "ACTIVE":
      return "active";
    case "PAUSED_OWNER":
    case "PAUSED_ADMIN":
      return "paused";
    case "ENDED":
    case "TERMINATED":
    case "ARCHIVED":
    case "EXHAUSTED":
    case "REJECTED":
      return "ended";
    default:
      return null;
  }
}
