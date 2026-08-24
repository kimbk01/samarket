/**
 * HOME DATA SOURCE — existing composer membership ids only. No invented ranking.
 */

import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import { isNewStoreSignal } from "@/lib/stores/store-new-store-signal";

export const STORES_HOME_DATA_SOURCE_IDS = [
  "order_now",
  "popular_menu",
  "new_store",
  "editorial_promo",
  "delivery_fee_benefit",
  "high_rating",
  "recommended",
  "rest_stores",
] as const;

export type StoresHomeDataSourceId = (typeof STORES_HOME_DATA_SOURCE_IDS)[number];

const HIGH_RATING_MIN_RATING = 4;
const HIGH_RATING_MIN_REVIEWS = 3;

type HomePurposeOrRestSlot =
  | "slot0Food"
  | "slot2Food"
  | "newStoreFood"
  | "campaignFood"
  | "slot3Food"
  | "slot4Food"
  | "slot5Food"
  | "slot6RestStores";

export const STORES_HOME_SLOT_DEFAULT_DATA_SOURCE: Record<HomePurposeOrRestSlot, StoresHomeDataSourceId> = {
  slot0Food: "order_now",
  slot2Food: "popular_menu",
  newStoreFood: "new_store",
  campaignFood: "editorial_promo",
  slot3Food: "delivery_fee_benefit",
  slot4Food: "high_rating",
  slot5Food: "recommended",
  slot6RestStores: "rest_stores",
};

export function isStoresHomeDataSourceId(value: unknown): value is StoresHomeDataSourceId {
  return (
    typeof value === "string" &&
    (STORES_HOME_DATA_SOURCE_IDS as readonly string[]).includes(value)
  );
}

export function parseStoresHomeDataSource(
  raw: unknown,
  fallback: StoresHomeDataSourceId
): StoresHomeDataSourceId {
  return isStoresHomeDataSourceId(raw) ? raw : fallback;
}

export function defaultDataSourceForSlot(
  slot: string | null
): StoresHomeDataSourceId {
  if (!slot || !(slot in STORES_HOME_SLOT_DEFAULT_DATA_SOURCE)) return "order_now";
  return STORES_HOME_SLOT_DEFAULT_DATA_SOURCE[slot as HomePurposeOrRestSlot];
}

export function isFoodHomeDataSource(source: StoresHomeDataSourceId): boolean {
  return source !== "rest_stores";
}

export function presentationsAllowedForDataSource(
  source: StoresHomeDataSourceId
): readonly StoresHomePresentationPatternId[] {
  if (source === "rest_stores") {
    return ["timesale_vertical", "store_horizontal", "store_teaser_horizontal", "high_rating_horizontal"];
  }
  return [
    "food_horizontal",
    "editorial_grid",
    "high_rating_horizontal",
    "store_horizontal",
    "store_teaser_horizontal",
    "brand_circular",
  ];
}

export function coercePresentationForDataSource(
  source: StoresHomeDataSourceId,
  presentation: StoresHomePresentationPatternId
): StoresHomePresentationPatternId {
  const allowed = presentationsAllowedForDataSource(source);
  if (allowed.includes(presentation)) return presentation;
  return source === "rest_stores" ? "timesale_vertical" : "food_horizontal";
}

export function storeMatchesHomeDataSource(
  store: StoreHomeFeedItem,
  source: StoresHomeDataSourceId,
  nowMs: number = Date.now()
): boolean {
  switch (source) {
    case "order_now":
      return store.status === "open" && store.deliveryAvailable;
    case "popular_menu":
      return (store.completedOrderCount30d ?? 0) > 0;
    case "new_store":
      return isNewStoreSignal({ firstListedAt: store.firstListedAt, nowMs });
    case "editorial_promo":
      return String(store.discoveryCampaign?.id ?? "").trim().length > 0;
    case "delivery_fee_benefit": {
      const strike = store.deliveryFeeStrikePhp;
      return strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0;
    }
    case "high_rating":
      return store.rating >= HIGH_RATING_MIN_RATING && store.reviewCount >= HIGH_RATING_MIN_REVIEWS;
    case "recommended":
      return store.isFeatured === true;
    case "rest_stores":
      return true;
  }
}

export function countHomeDataSourceCandidates(
  stores: readonly StoreHomeFeedItem[],
  source: StoresHomeDataSourceId,
  nowMs: number = Date.now()
): number {
  if (source === "rest_stores") return stores.length;
  return stores.filter((s) => storeMatchesHomeDataSource(s, source, nowMs)).length;
}

export type HomeShelfHiddenReason =
  | "unavailable"
  | "disabled"
  | "schedule"
  | "empty_candidate"
  | "empty_allocated"
  | null;

export function diagnoseHomeShelfCustomerHidden(input: {
  unavailable: boolean;
  enabled: boolean;
  scheduleOk: boolean;
  candidateCount: number;
  allocatedCount: number;
}): { customerVisible: boolean; hiddenReason: HomeShelfHiddenReason } {
  if (input.unavailable) return { customerVisible: false, hiddenReason: "unavailable" };
  if (!input.enabled) return { customerVisible: false, hiddenReason: "disabled" };
  if (!input.scheduleOk) return { customerVisible: false, hiddenReason: "schedule" };
  if (input.candidateCount <= 0) return { customerVisible: false, hiddenReason: "empty_candidate" };
  if (input.allocatedCount <= 0) return { customerVisible: false, hiddenReason: "empty_allocated" };
  return { customerVisible: true, hiddenReason: null };
}
