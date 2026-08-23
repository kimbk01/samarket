/**
 * C4 — Composition engine (policy-driven cap/enable/order metadata).
 *
 * Preserves Discovery input order within each slot stream.
 * Live HOME consumes via `composeLiveHomeFeed` (C8); composer source unchanged.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  applyCapPreserveDiscoveryOrder,
  filterEnabledCompositionSections,
  preservesDiscoveryInputOrder,
  sortSectionsByPresentationOrder,
} from "@/lib/stores/composition/stores-composition-invariants";
import {
  homeCompositionSlotItemIds,
  STORES_HOME_COMPOSITION_SLOT_KEYS,
  type StoresHomeCompositionSlotKey,
} from "@/lib/stores/composition/stores-composition-home-slots";
import { STORES_BROWSE_ORGANIC_LIST_SLOT } from "@/lib/stores/composition/stores-browse-composition-boundary";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export type PolicyDrivenHomeComposition = StoresHomeFeedComposition;

export type BrowsePolicyEngineResult = {
  organicIds: string[];
  slots: Array<{
    slot: string;
    enabled: boolean;
    order: number;
    max: number | null;
    itemIds: string[];
    liveInjected: boolean;
  }>;
};

function applyPolicyCap<T>(items: readonly T[], policy: StoresCompositionSectionContract): T[] {
  if (!policy.enabled) return [];
  if (policy.max == null) return [...items];
  return applyCapPreserveDiscoveryOrder(items, policy.max);
}

function policyRowBySlot(
  policy: readonly StoresCompositionSectionContract[]
): Map<string, StoresCompositionSectionContract> {
  return new Map(policy.map((row) => [row.slot, row]));
}

/**
 * Apply resolved policy to a production HOME composition (shadow path).
 * Input `current` must be production `composeStoresHomeFeed` output.
 */
export function applyPolicyToHomeComposition(
  current: StoresHomeFeedComposition,
  policy: readonly StoresCompositionSectionContract[]
): PolicyDrivenHomeComposition {
  const bySlot = policyRowBySlot(policy);
  const out = { ...current };

  for (const slot of STORES_HOME_COMPOSITION_SLOT_KEYS) {
    const row = bySlot.get(slot);
    if (!row) continue;
    const items = current[slot];
    const capped = applyPolicyCap(
      items as readonly (StoreHomeFeedItem | StoresHomeFoodEntry)[],
      row
    );
    (out as Record<StoresHomeCompositionSlotKey, unknown>)[slot] = capped;
  }

  return out;
}

/** Enabled sections sorted by presentation order (metadata only). */
export function resolveEnabledSectionOrder(
  policy: readonly StoresCompositionSectionContract[]
): StoresCompositionSectionContract[] {
  return sortSectionsByPresentationOrder(filterEnabledCompositionSections(policy));
}

export function assertHomeSlotPreservesDiscoveryOrder(
  slot: StoresHomeCompositionSlotKey,
  before: readonly StoreHomeFeedItem[] | readonly StoresHomeFoodEntry[],
  after: readonly StoreHomeFeedItem[] | readonly StoresHomeFoodEntry[]
): boolean {
  const keyOf = (id: string) => id;
  const beforeIds = homeCompositionSlotItemIds(slot, before);
  const afterIds = homeCompositionSlotItemIds(slot, after);
  return preservesDiscoveryInputOrder(beforeIds, afterIds, keyOf);
}

/**
 * BROWSE policy engine — organic list cap/enable in shadow only.
 * Future insertion slots never inject live content.
 */
export function applyPolicyToBrowseComposition(
  productionOrganicIds: readonly string[],
  policy: readonly StoresCompositionSectionContract[]
): BrowsePolicyEngineResult {
  const bySlot = policyRowBySlot(policy);
  const organicPolicy = bySlot.get(STORES_BROWSE_ORGANIC_LIST_SLOT);
  let organicIds = [...productionOrganicIds];
  if (organicPolicy) {
    organicIds = applyPolicyCap(productionOrganicIds, organicPolicy);
  }

  const slots = sortSectionsByPresentationOrder(policy).map((row) => {
    const isOrganic = row.slot === STORES_BROWSE_ORGANIC_LIST_SLOT;
    const isFutureInsertion = !isOrganic;
    return {
      slot: row.slot,
      enabled: row.enabled,
      order: row.order,
      max: row.max,
      itemIds: isOrganic ? organicIds : [],
      liveInjected: false,
      ...(isFutureInsertion ? { shadowPlacementOnly: true as const } : {}),
    };
  });

  return { organicIds, slots };
}
