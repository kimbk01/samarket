/**
 * C8 — Live composition cutover (HOME).
 *
 * Discovery feed → `composeStoresHomeFeed` → resolved policy → engine → user-facing HOME.
 * Composer source is unchanged; policy applies cap/enable only.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import { applyPolicyToHomeComposition } from "@/lib/stores/composition/stores-composition-engine";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  composeStoresHomeFeed,
  type StoresHomeFeedComposition,
} from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import { defaultDataSourceForSlot } from "@/lib/stores/product/stores-home-data-source";

const PURPOSE_FOOD_SLOTS = new Set<StoresHomeCompositionSlotKey>([
  "slot0Food",
  "slot2Food",
  "newStoreFood",
  "campaignFood",
  "slot3Food",
  "slot4Food",
  "slot5Food",
]);

export type StoresHomeCompositionPolicyMeta = {
  rows: StoresCompositionSectionContract[];
  overrideCount: number;
  rejectedOverrideSlots: string[];
  engine: "live";
};

export function resolveLiveHomeCompositionPolicy(
  policyMeta: StoresHomeCompositionPolicyMeta | null | undefined
): StoresCompositionSectionContract[] {
  if (policyMeta?.rows?.length) return policyMeta.rows;
  return resolveDefaultCompositionPolicy("home");
}

/**
 * Live HOME composition — production composer output with resolved policy applied.
 * Falls back to canonical default policy when server meta is absent (resolver contract).
 */
export function composeLiveHomeFeed(
  stores: readonly StoreHomeFeedItem[],
  policyMeta?: StoresHomeCompositionPolicyMeta | null,
  shelves?: readonly StoresHomeShelfResolvedConfig[] | null
): StoresHomeFeedComposition {
  const shelfList = shelves?.length ? shelves : policyMeta && "shelfProduct" in policyMeta
    ? (policyMeta as { shelfProduct?: { shelves?: StoresHomeShelfResolvedConfig[] } }).shelfProduct
        ?.shelves
    : undefined;
  const composed = shelfList?.length
    ? composeStoresHomeFeed(stores, composerOptsFromShelves(shelfList))
    : composeStoresHomeFeed(stores);
  const policy = resolveLiveHomeCompositionPolicy(policyMeta ?? null);
  return applyPolicyToHomeComposition(composed, policy);
}

function composerOptsFromShelves(shelves: readonly StoresHomeShelfResolvedConfig[]) {
  const purposeAllocationOrder = [...shelves]
    .filter(
      (s) =>
        s.customerVisible &&
        s.composerSlot != null &&
        PURPOSE_FOOD_SLOTS.has(s.composerSlot)
    )
    .sort((a, b) => a.order - b.order)
    .map((s) => s.composerSlot!);
  const slotDataSources: Partial<Record<StoresHomeCompositionSlotKey, ReturnType<typeof defaultDataSourceForSlot>>> =
    {};
  const slotMax: Partial<Record<StoresHomeCompositionSlotKey, number | null>> = {};
  for (const s of shelves) {
    if (!s.composerSlot) continue;
    slotDataSources[s.composerSlot] = s.dataSource ?? defaultDataSourceForSlot(s.composerSlot);
    slotMax[s.composerSlot] = s.max;
  }
  return { purposeAllocationOrder, slotDataSources, slotMax };
}
