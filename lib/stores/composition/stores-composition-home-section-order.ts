/**
 * C8 — HOME section presentation order from resolved composition policy.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  filterEnabledCompositionSections,
  sortSectionsByPresentationOrder,
} from "@/lib/stores/composition/stores-composition-invariants";
import {
  STORES_HOME_COMPOSITION_SLOT_KEYS,
  type StoresHomeCompositionSlotKey,
} from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";

function isHomeCompositionSlotKey(slot: string): slot is StoresHomeCompositionSlotKey {
  return (STORES_HOME_COMPOSITION_SLOT_KEYS as readonly string[]).includes(slot);
}

export function isHomeCompositionSlotVisible(
  slot: StoresHomeCompositionSlotKey,
  composition: StoresHomeFeedComposition
): boolean {
  const items = composition[slot];
  return Array.isArray(items) && items.length > 0;
}

/**
 * Enabled policy rows sorted by `order`, excluding empty composition slots.
 * Single HOME section-order authority for live rendering.
 */
export function resolveOrderedVisibleHomeCompositionSlots(
  policy: readonly StoresCompositionSectionContract[],
  composition: StoresHomeFeedComposition
): StoresHomeCompositionSlotKey[] {
  const ordered = sortSectionsByPresentationOrder(filterEnabledCompositionSections(policy));
  const slots: StoresHomeCompositionSlotKey[] = [];
  for (const row of ordered) {
    if (!isHomeCompositionSlotKey(row.slot)) continue;
    if (!isHomeCompositionSlotVisible(row.slot, composition)) continue;
    slots.push(row.slot);
  }
  return slots;
}

/** First N visible sections render eagerly (LCP); remainder deferred. */
export const STORES_HOME_EAGER_COMPOSITION_SECTION_COUNT = 2;

export function splitHomeCompositionSlotsForRender(
  orderedVisibleSlots: readonly StoresHomeCompositionSlotKey[]
): {
  eagerSlots: StoresHomeCompositionSlotKey[];
  deferredSlots: StoresHomeCompositionSlotKey[];
} {
  return {
    eagerSlots: orderedVisibleSlots.slice(0, STORES_HOME_EAGER_COMPOSITION_SECTION_COUNT),
    deferredSlots: orderedVisibleSlots.slice(STORES_HOME_EAGER_COMPOSITION_SECTION_COUNT),
  };
}
