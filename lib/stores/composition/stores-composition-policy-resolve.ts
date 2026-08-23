/**
 * C2 — Resolve C1 default + Admin persisted overrides (read path only; no live engine).
 */

import type {
  StoresCompositionSectionContract,
  StoresCompositionSurface,
} from "@/lib/stores/composition/stores-composition-contract";
import { getCanonicalCompositionRows } from "@/lib/stores/composition/stores-composition-canonical-registry";
import { toResolvedCompositionPolicyRow } from "@/lib/stores/composition/stores-composition-policy-validation";

export type StoresCompositionPolicyOverrideRow = {
  surface: StoresCompositionSurface;
  slot: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: StoresCompositionSectionContract["interval"];
  updatedAt?: string | null;
  hasOverride: boolean;
};

export function resolveCompositionPolicyForSurface(
  surface: StoresCompositionSurface,
  overrides: readonly StoresCompositionPolicyOverrideRow[]
): StoresCompositionSectionContract[] {
  const overrideBySlot = new Map(overrides.map((o) => [o.slot, o]));
  return getCanonicalCompositionRows(surface).map((canonical) => {
    const o = overrideBySlot.get(canonical.slot);
    if (!o || !o.hasOverride) {
      return { ...canonical };
    }
    return toResolvedCompositionPolicyRow(canonical, {
      enabled: o.enabled,
      order: o.order,
      max: o.max,
      interval: o.interval,
    });
  });
}
