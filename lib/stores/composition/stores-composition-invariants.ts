/**
 * C1 — Composition contract invariants (pure functions).
 * Used by future composition engine; C1 proves order/cap/dedupe contracts only.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

/** Apply max cap without reordering Discovery input. */
export function applyCapPreserveDiscoveryOrder<T>(items: readonly T[], max: number): T[] {
  if (!Number.isFinite(max) || max <= 0) return [];
  return items.slice(0, max);
}

/** Dedupe by key while preserving first-seen relative order. */
export function dedupePreserveDiscoveryOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => string
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * True when every output item appears in input and relative order among survivors matches input.
 * Output may be shorter (cap/dedupe/disable) but must not reorder survivors.
 */
export function preservesDiscoveryInputOrder<T>(
  input: readonly T[],
  output: readonly T[],
  keyOf: (item: T) => string
): boolean {
  const inputIndex = new Map<string, number>();
  input.forEach((item, index) => {
    const key = keyOf(item);
    if (key && !inputIndex.has(key)) inputIndex.set(key, index);
  });

  let lastIndex = -1;
  for (const item of output) {
    const key = keyOf(item);
    if (!key) return false;
    const idx = inputIndex.get(key);
    if (idx === undefined) return false;
    if (idx < lastIndex) return false;
    lastIndex = idx;
  }
  return true;
}

/** Enabled sections only — disabled sections produce no consumption. */
export function filterEnabledCompositionSections(
  sections: readonly StoresCompositionSectionContract[]
): StoresCompositionSectionContract[] {
  return sections.filter((s) => s.enabled);
}

/**
 * Section presentation order is independent from Discovery ranking order.
 * Ranking order applies inside composer source streams; `order` is UI section sequence only.
 */
export function sortSectionsByPresentationOrder(
  sections: readonly StoresCompositionSectionContract[]
): StoresCompositionSectionContract[] {
  return [...sections].sort((a, b) => a.order - b.order);
}
