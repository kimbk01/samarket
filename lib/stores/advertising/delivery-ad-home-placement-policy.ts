/**
 * PRODUCT CUT 1 — Resolved HOME paid placement policy (same sources as customer insertion).
 * UI must display these values — never hardcode interval 8 / max 5 in JSX.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  homePaidAdInsertionPolicyEnabled,
  homePaidAdInsertionPolicyMax,
  STORES_INSERTION_DEFAULT_INTERVAL,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import { resolveHomeRestPaidSurfaceAllowed } from "@/lib/stores/store-paid-ad-exposure";

export type HomePaidPlacementPolicySummary = {
  /** Effective surface gate (rest ad_integration OR composition homePaidAdInsertion). */
  enabled: boolean;
  /** Max ads for rest list insertion (composition max, default applied in helper). */
  max: number | null;
  /** Interval used by loadStoresHomeInsertionMeta today. */
  intervalEveryN: number;
  /** Composition rail enabled flag (diagnostic). */
  compositionRailEnabled: boolean;
  restShelfAdIntegration: string | null;
};

/**
 * Resolve HOME rest paid-ad placement policy for Admin display.
 * Mirrors loadStoresHomeInsertionMeta gate + max + interval sources.
 */
export function resolveHomePaidPlacementPolicySummary(input: {
  compositionRows: readonly StoresCompositionSectionContract[];
  restShelfAdIntegration?: string | null;
}): HomePaidPlacementPolicySummary {
  const compositionRailEnabled = homePaidAdInsertionPolicyEnabled(input.compositionRows);
  const restShelfAdIntegration =
    input.restShelfAdIntegration == null ? null : String(input.restShelfAdIntegration);
  const enabled = resolveHomeRestPaidSurfaceAllowed({
    restShelfAdIntegration,
    homePaidAdInsertionEnabled: compositionRailEnabled,
  });
  return {
    enabled,
    max: homePaidAdInsertionPolicyMax(input.compositionRows),
    intervalEveryN: STORES_INSERTION_DEFAULT_INTERVAL,
    compositionRailEnabled,
    restShelfAdIntegration,
  };
}
