/**
 * C3-C5 — HOME composition slot keys (SSOT for engine + shadow).
 */

import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

/** HOME slots compared in C5 shadow (presentation order). */
export const STORES_HOME_COMPOSITION_SLOT_KEYS = [
  "slot0Food",
  "slot1Stores",
  "slot2Food",
  "newStoreFood",
  "campaignFood",
  "slot3Food",
  "slot4Food",
  "slot5Food",
  "slot6NearbyStores",
  "slot6RestStores",
] as const satisfies readonly (keyof StoresHomeFeedComposition)[];

export type StoresHomeCompositionSlotKey = (typeof STORES_HOME_COMPOSITION_SLOT_KEYS)[number];

const STORE_SLOTS = new Set<StoresHomeCompositionSlotKey>([
  "slot1Stores",
  "slot6NearbyStores",
  "slot6RestStores",
]);

export function homeCompositionSlotItemIds(
  slot: StoresHomeCompositionSlotKey,
  items: readonly StoreHomeFeedItem[] | readonly StoresHomeFoodEntry[]
): string[] {
  if (STORE_SLOTS.has(slot)) {
    return (items as readonly StoreHomeFeedItem[]).map((s) => s.id);
  }
  return (items as readonly StoresHomeFoodEntry[]).map((e) => `${e.storeId}:${e.productId}`);
}
