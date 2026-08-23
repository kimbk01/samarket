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
  policyMeta?: StoresHomeCompositionPolicyMeta | null
): StoresHomeFeedComposition {
  const composed = composeStoresHomeFeed(stores);
  const policy = resolveLiveHomeCompositionPolicy(policyMeta ?? null);
  return applyPolicyToHomeComposition(composed, policy);
}
