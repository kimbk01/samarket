/**
 * C1 canonical identity registry — single lookup for C2 validation + default merge.
 */

import type {
  StoresCompositionSectionContract,
  StoresCompositionSurface,
} from "@/lib/stores/composition/stores-composition-contract";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";

export const STORES_COMPOSITION_CANONICAL_POLICY: readonly StoresCompositionSectionContract[] = [
  ...STORES_HOME_COMPOSITION_DEFAULT_POLICY,
  ...STORES_BROWSE_COMPOSITION_DEFAULT_POLICY,
] as const;

const canonicalBySurfaceSlot = new Map<string, StoresCompositionSectionContract>(
  STORES_COMPOSITION_CANONICAL_POLICY.map((row) => [`${row.surface}:${row.slot}`, row])
);

export function canonicalCompositionSlotKey(surface: string, slot: string): string {
  return `${surface}:${slot}`;
}

export function getCanonicalCompositionRows(
  surface: StoresCompositionSurface
): readonly StoresCompositionSectionContract[] {
  return STORES_COMPOSITION_CANONICAL_POLICY.filter((row) => row.surface === surface);
}

export function getCanonicalCompositionRow(
  surface: StoresCompositionSurface,
  slot: string
): StoresCompositionSectionContract | null {
  return canonicalBySurfaceSlot.get(canonicalCompositionSlotKey(surface, slot)) ?? null;
}
