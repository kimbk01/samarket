/**
 * C5 — Composition shadow: CURRENT production vs policy engine (shadow-only).
 *
 * Live surfaces MUST continue using production composition unchanged.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  homeCompositionSlotItemIds,
  STORES_HOME_COMPOSITION_SLOT_KEYS,
  type StoresHomeCompositionSlotKey,
} from "@/lib/stores/composition/stores-composition-home-slots";
import { STORES_BROWSE_ORGANIC_LIST_SLOT } from "@/lib/stores/composition/stores-browse-composition-boundary";
import {
  applyPolicyToBrowseComposition,
  applyPolicyToHomeComposition,
} from "@/lib/stores/composition/stores-composition-engine";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export type HomeSlotShadowDiff = {
  slot: StoresHomeCompositionSlotKey;
  enabled: boolean;
  order: number;
  max: number | null;
  currentIds: string[];
  shadowIds: string[];
  sameOrder: boolean;
  sameCount: boolean;
  sameEnabled: boolean;
  reasonForDifference: string | null;
};

export type HomeCompositionShadowReport = {
  surface: "home";
  current: Record<StoresHomeCompositionSlotKey, string[]>;
  shadow: Record<StoresHomeCompositionSlotKey, string[]>;
  slots: HomeSlotShadowDiff[];
  defaultParity: boolean;
  overrideDeltaOnly: boolean;
  diffCount: number;
};

export type BrowseCompositionShadowReport = {
  surface: "browse";
  current: { organicIds: string[] };
  shadow: { organicIds: string[]; futureSlotsLiveInjected: boolean };
  organicSameOrder: boolean;
  organicSameCount: boolean;
  futureInsertionsLive: boolean;
  defaultParity: boolean;
};

export type CompositionShadowBundle = {
  home: HomeCompositionShadowReport;
  browse: BrowseCompositionShadowReport;
};

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function explainHomeSlotDiff(
  slot: string,
  currentIds: string[],
  shadowIds: string[],
  policyRow: StoresCompositionSectionContract | undefined,
  isOverrideSlot: boolean
): string | null {
  if (idsEqual(currentIds, shadowIds)) return null;
  if (!policyRow) return `no_policy_row:${slot}`;
  if (!policyRow.enabled && currentIds.length > 0) return "policy_disabled_slot";
  if (policyRow.max != null && shadowIds.length < currentIds.length) {
    return isOverrideSlot
      ? `admin_override_max:${policyRow.max}`
      : `policy_max:${policyRow.max}`;
  }
  return "unexplained_diff";
}

export function compareHomeCompositionShadow(
  current: StoresHomeFeedComposition,
  shadow: StoresHomeFeedComposition,
  policy: readonly StoresCompositionSectionContract[],
  options?: { overrideSlots?: ReadonlySet<string> }
): HomeCompositionShadowReport {
  const policyBySlot = new Map(policy.map((r) => [r.slot, r]));
  const slots: HomeSlotShadowDiff[] = [];
  const currentMap = {} as Record<StoresHomeCompositionSlotKey, string[]>;
  const shadowMap = {} as Record<StoresHomeCompositionSlotKey, string[]>;

  for (const slot of STORES_HOME_COMPOSITION_SLOT_KEYS) {
    const policyRow = policyBySlot.get(slot);
    const currentIds = homeCompositionSlotItemIds(slot, current[slot]);
    const shadowIds = homeCompositionSlotItemIds(slot, shadow[slot]);
    currentMap[slot] = currentIds;
    shadowMap[slot] = shadowIds;

    const isOverride = options?.overrideSlots?.has(slot) ?? false;
    slots.push({
      slot,
      enabled: policyRow?.enabled ?? true,
      order: policyRow?.order ?? -1,
      max: policyRow?.max ?? null,
      currentIds,
      shadowIds,
      sameOrder: idsEqual(currentIds, shadowIds),
      sameCount: currentIds.length === shadowIds.length,
      sameEnabled: (policyRow?.enabled ?? true) === true,
      reasonForDifference: explainHomeSlotDiff(slot, currentIds, shadowIds, policyRow, isOverride),
    });
  }

  const diffCount = slots.filter((s) => !s.sameOrder).length;
  const defaultParity = diffCount === 0;
  const overrideDeltaOnly =
    diffCount === 0 ||
    slots.every((s) => s.sameOrder || (options?.overrideSlots?.has(s.slot) ?? false));

  return {
    surface: "home",
    current: currentMap,
    shadow: shadowMap,
    slots,
    defaultParity,
    overrideDeltaOnly,
    diffCount,
  };
}

export function compareBrowseCompositionShadow(
  productionOrganicIds: readonly string[],
  policy: readonly StoresCompositionSectionContract[]
): BrowseCompositionShadowReport {
  const shadowResult = applyPolicyToBrowseComposition(productionOrganicIds, policy);
  const shadowOrganicIds = shadowResult.organicIds;
  const futureInsertionsLive = shadowResult.slots.some(
    (s) => s.slot !== STORES_BROWSE_ORGANIC_LIST_SLOT && s.liveInjected
  );

  return {
    surface: "browse",
    current: { organicIds: [...productionOrganicIds] },
    shadow: { organicIds: shadowOrganicIds, futureSlotsLiveInjected: futureInsertionsLive },
    organicSameOrder: idsEqual(productionOrganicIds, shadowOrganicIds),
    organicSameCount: productionOrganicIds.length === shadowOrganicIds.length,
    futureInsertionsLive,
    defaultParity:
      idsEqual(productionOrganicIds, shadowOrganicIds) && !futureInsertionsLive,
  };
}

export function runHomeCompositionShadow(
  stores: readonly StoreHomeFeedItem[],
  policy: readonly StoresCompositionSectionContract[],
  options?: { overrideSlots?: ReadonlySet<string> }
): HomeCompositionShadowReport {
  const current = composeStoresHomeFeed(stores);
  const shadow = applyPolicyToHomeComposition(current, policy);
  return compareHomeCompositionShadow(current, shadow, policy, options);
}

export function runBrowseCompositionShadow(
  productionOrganicIds: readonly string[],
  policy?: readonly StoresCompositionSectionContract[]
): BrowseCompositionShadowReport {
  const resolved = policy ?? resolveDefaultCompositionPolicy("browse");
  return compareBrowseCompositionShadow(productionOrganicIds, resolved);
}

export function runCompositionShadowBundle(
  stores: readonly StoreHomeFeedItem[],
  homePolicy: readonly StoresCompositionSectionContract[],
  browseOrganicIds: readonly string[],
  browsePolicy: readonly StoresCompositionSectionContract[],
  options?: { homeOverrideSlots?: ReadonlySet<string> }
): CompositionShadowBundle {
  return {
    home: runHomeCompositionShadow(stores, homePolicy, {
      overrideSlots: options?.homeOverrideSlots,
    }),
    browse: compareBrowseCompositionShadow(browseOrganicIds, browsePolicy),
  };
}
