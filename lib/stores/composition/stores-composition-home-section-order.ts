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
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";

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

function findShelfProduct(
  slot: StoresHomeCompositionSlotKey,
  shelfProduct: readonly StoresHomeShelfResolvedConfig[] | undefined
): StoresHomeShelfResolvedConfig | null {
  if (!shelfProduct?.length) return null;
  return shelfProduct.find((s) => s.composerSlot === slot) ?? null;
}

/**
 * Enabled policy rows sorted by `order`.
 * 어드민 선반 설정이 있는 슬롯: `customerVisible`(켜짐 + 기간 안 + 사용 가능 선반)만으로 판정 —
 * 매장 0곳이어도 제목·빈 상태로 남는다 (Owner 2026-10-29 10:05, H-01).
 * 선반 설정이 없는 슬롯: 기존대로 빈 조합이면 제외.
 */
export function resolveOrderedVisibleHomeCompositionSlots(
  policy: readonly StoresCompositionSectionContract[],
  composition: StoresHomeFeedComposition,
  shelfProduct?: readonly StoresHomeShelfResolvedConfig[]
): StoresHomeCompositionSlotKey[] {
  const ordered = sortSectionsByPresentationOrder(filterEnabledCompositionSections(policy));
  const slots: StoresHomeCompositionSlotKey[] = [];
  const rest: StoresHomeCompositionSlotKey[] = [];
  for (const row of ordered) {
    if (!isHomeCompositionSlotKey(row.slot)) continue;
    const shelf = findShelfProduct(row.slot, shelfProduct);
    if (shelf) {
      if (!shelf.customerVisible) continue;
    } else if (!isHomeCompositionSlotVisible(row.slot, composition)) {
      continue;
    }
    if (row.slot === "slot6RestStores") {
      rest.push(row.slot);
      continue;
    }
    slots.push(row.slot);
  }
  return [...slots, ...rest];
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
