/**
 * C3 — Runtime policy resolution: DEFAULT + PERSISTED OVERRIDES → RESOLVED POLICY.
 *
 * Live HOME consumes via home-feed meta + `composeLiveHomeFeed` (C8).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StoresCompositionSectionContract,
  StoresCompositionSurface,
} from "@/lib/stores/composition/stores-composition-contract";
import { getCanonicalCompositionRows } from "@/lib/stores/composition/stores-composition-canonical-registry";
import { listCompositionPolicyOverrides } from "@/lib/stores/composition/stores-composition-policy-db";
import {
  resolveCompositionPolicyForSurface,
  type StoresCompositionPolicyOverrideRow,
} from "@/lib/stores/composition/stores-composition-policy-resolve";
import { validateCompositionPolicyWriteRow } from "@/lib/stores/composition/stores-composition-policy-validation";

export type ResolvedCompositionPolicyBundle = {
  surface: StoresCompositionSurface;
  rows: StoresCompositionSectionContract[];
  overrideCount: number;
  rejectedOverrideSlots: string[];
};

/** Default policy only (no DB). */
export function resolveDefaultCompositionPolicy(
  surface: StoresCompositionSurface
): StoresCompositionSectionContract[] {
  return getCanonicalCompositionRows(surface).map((row) => ({ ...row }));
}

function sanitizeOverrides(
  surface: StoresCompositionSurface,
  overrides: readonly StoresCompositionPolicyOverrideRow[]
): { accepted: StoresCompositionPolicyOverrideRow[]; rejected: string[] } {
  const accepted: StoresCompositionPolicyOverrideRow[] = [];
  const rejected: string[] = [];

  for (const o of overrides) {
    const err = validateCompositionPolicyWriteRow({
      surface,
      slot: o.slot,
      enabled: o.enabled,
      order: o.order,
      max: o.max,
      interval: o.interval,
    });
    if (err) {
      rejected.push(o.slot);
      continue;
    }
    accepted.push(o);
  }

  return { accepted, rejected };
}

/**
 * Resolve policy for a surface, rejecting invalid persisted override rows.
 * Missing override → canonical default for that slot.
 */
export function resolveCompositionPolicyRuntime(
  surface: StoresCompositionSurface,
  overrides: readonly StoresCompositionPolicyOverrideRow[]
): ResolvedCompositionPolicyBundle {
  const { accepted, rejected } = sanitizeOverrides(surface, overrides);
  const rows = resolveCompositionPolicyForSurface(surface, accepted);
  return {
    surface,
    rows,
    overrideCount: accepted.filter((o) => o.hasOverride).length,
    rejectedOverrideSlots: rejected,
  };
}

/** Load persisted overrides from DB and resolve (C3 runtime entry). */
export async function loadRuntimeCompositionPolicy(
  sb: SupabaseClient,
  surface: StoresCompositionSurface
): Promise<ResolvedCompositionPolicyBundle> {
  const overrides = await listCompositionPolicyOverrides(sb, surface);
  const overrideRows: StoresCompositionPolicyOverrideRow[] = overrides.map((o) => ({
    surface: o.surface,
    slot: o.slot,
    enabled: o.enabled,
    order: o.section_order,
    max: o.max_items,
    interval: o.interval_consumed
      ? { consumed: true as const, everyN: o.interval_every_n ?? 1 }
      : { consumed: false as const, reason: "NOT_CONSUMED" as const },
    updatedAt: o.updated_at,
    hasOverride: true,
  }));
  return resolveCompositionPolicyRuntime(surface, overrideRows);
}
