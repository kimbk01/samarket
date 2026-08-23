/**
 * C1 — BROWSE composition boundary (contract only).
 *
 * BROWSE organic list authority = Discovery ranked result (`store-discovery-browse-sort`).
 * No HOME-style multi-shelf composer exists today.
 */

import type {
  StoresBrowseCompositionSlotId,
  StoresCompositionIntervalContract,
  StoresCompositionSectionContract,
} from "@/lib/stores/composition/stores-composition-contract";

const NOT_CONSUMED_INTERVAL: StoresCompositionIntervalContract = {
  consumed: false,
  reason: "NOT_CONSUMED",
};

/**
 * BROWSE default — organic Discovery list only; insertion slots reserved, not consumed.
 */
export const STORES_BROWSE_COMPOSITION_DEFAULT_POLICY: readonly StoresCompositionSectionContract[] = [
  {
    surface: "browse",
    slot: "organic_discovery_list",
    contentType: "store",
    enabled: true,
    order: 0,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "none",
    notes:
      "Authority: Discovery browse RPC + sortStoreDiscoveryBrowseRows. Composition must not resort.",
  },
  {
    surface: "browse",
    slot: "future_ad_insertion",
    contentType: "ad",
    enabled: false,
    order: 1,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "none",
    notes: "CONTRACT ONLY — insertion engine NOT_STARTED.",
  },
  {
    surface: "browse",
    slot: "future_coupon_insertion",
    contentType: "coupon",
    enabled: false,
    order: 2,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "none",
    notes: "CONTRACT ONLY — must not reorder organic Discovery rows.",
  },
  {
    surface: "browse",
    slot: "future_promoted_placement",
    contentType: "store",
    enabled: false,
    order: 3,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "none",
    notes: "CONTRACT ONLY — promoted rows consume capped slots; organic order preserved elsewhere.",
  },
] as const;

export const STORES_BROWSE_ORGANIC_LIST_SLOT: StoresBrowseCompositionSlotId =
  "organic_discovery_list";

/** Explicit boundary — future insertion must not mutate Discovery authorities. */
export const STORES_BROWSE_COMPOSITION_BOUNDARY = {
  organicListAuthority: "discovery_ranked_browse_result",
  composerExists: false,
  reorderOrganicForbidden: true,
  insertionEngine: "NOT_STARTED",
  intervalField: NOT_CONSUMED_INTERVAL,
} as const;
