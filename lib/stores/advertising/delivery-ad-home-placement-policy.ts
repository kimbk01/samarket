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
  /** Effective surface gate — 5-B HS-03: rest ad_integration 단일 기준. */
  enabled: boolean;
  /** Max ads for rest list insertion (composition max, default applied in helper). */
  max: number | null;
  /** Interval used by loadStoresHomeInsertionMeta today. */
  intervalEveryN: number;
  /** Composition rail enabled flag (diagnostic only — 판정에 쓰지 않음, 선반 저장 시 동기화). */
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
  const enabled = resolveHomeRestPaidSurfaceAllowed({ restShelfAdIntegration });
  return {
    enabled,
    max: homePaidAdInsertionPolicyMax(input.compositionRows),
    intervalEveryN: STORES_INSERTION_DEFAULT_INTERVAL,
    compositionRailEnabled,
    restShelfAdIntegration,
  };
}
