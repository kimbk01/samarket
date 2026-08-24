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
  type ComposeStoresHomeFeedOpts,
  type StoresHomeFeedComposition,
} from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import { defaultDataSourceForSlot } from "@/lib/stores/product/stores-home-data-source";
import {
  resolvePopularityWindowDays,
  type StoresPopularityWindowDays,
} from "@/lib/stores/store-discovery-popular-store";

export type StoresHomePopularityOverlayMeta = {
  untilIso: string;
  countsByDays: Record<string, Record<string, number>>;
};

export type StoresHomeCompositionPolicyMeta = {
  rows: StoresCompositionSectionContract[];
  overrideCount: number;
  rejectedOverrideSlots: string[];
  engine: "live";
  popularityOverlay?: StoresHomePopularityOverlayMeta;
};

const PURPOSE_FOOD_SLOTS = new Set<StoresHomeCompositionSlotKey>([
  "slot0Food",
  "slot2Food",
  "newStoreFood",
  "campaignFood",
  "slot3Food",
  "slot4Food",
  "slot5Food",
]);

export function collectHomePopularMenuWindowDays(
  shelves: readonly StoresHomeShelfResolvedConfig[] | undefined
): StoresPopularityWindowDays[] {
  const set = new Set<StoresPopularityWindowDays>();
  for (const s of shelves ?? []) {
    const source = s.dataSource ?? defaultDataSourceForSlot(s.composerSlot);
    if (source !== "popular_menu") continue;
    set.add(resolvePopularityWindowDays(s.productConfig.popularityWindowDays));
  }
  if (set.size === 0) set.add(30);
  return [...set].sort((a, b) => a - b);
}

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
  policyMeta?: StoresHomeCompositionPolicyMeta | null,
  shelves?: readonly StoresHomeShelfResolvedConfig[] | null
): StoresHomeFeedComposition {
  const shelfList = shelves?.length ? shelves : policyMeta && "shelfProduct" in policyMeta
    ? (policyMeta as { shelfProduct?: { shelves?: StoresHomeShelfResolvedConfig[] } }).shelfProduct
        ?.shelves
    : undefined;
  const composed = shelfList?.length
    ? composeStoresHomeFeed(stores, composerOptsFromShelves(shelfList, policyMeta?.popularityOverlay))
    : composeStoresHomeFeed(stores);
  const policy = resolveLiveHomeCompositionPolicy(policyMeta ?? null);
  return applyPolicyToHomeComposition(composed, policy);
}

function deserializeCountsByDays(
  overlay: StoresHomePopularityOverlayMeta | undefined
): ComposeStoresHomeFeedOpts["popularityCountsByDays"] {
  if (!overlay?.countsByDays) return undefined;
  const out: NonNullable<ComposeStoresHomeFeedOpts["popularityCountsByDays"]> = {};
  for (const key of Object.keys(overlay.countsByDays)) {
    const days = resolvePopularityWindowDays(Number(key));
    const map = new Map<string, number>();
    for (const [id, n] of Object.entries(overlay.countsByDays[key] ?? {})) {
      map.set(id, n);
    }
    out[days] = map;
  }
  return out;
}

function composerOptsFromShelves(
  shelves: readonly StoresHomeShelfResolvedConfig[],
  overlay?: StoresHomePopularityOverlayMeta
): ComposeStoresHomeFeedOpts {
  const purposeAllocationOrder = [...shelves]
    .filter(
      (s) =>
        s.customerVisible &&
        s.composerSlot != null &&
        PURPOSE_FOOD_SLOTS.has(s.composerSlot)
    )
    .sort((a, b) => a.order - b.order)
    .map((s) => s.composerSlot!);
  const slotDataSources: Partial<Record<StoresHomeCompositionSlotKey, ReturnType<typeof defaultDataSourceForSlot>>> =
    {};
  const slotMax: Partial<Record<StoresHomeCompositionSlotKey, number | null>> = {};
  const slotPopularityWindowDays: Partial<Record<StoresHomeCompositionSlotKey, StoresPopularityWindowDays>> = {};
  for (const s of shelves) {
    if (!s.composerSlot) continue;
    const source = s.dataSource ?? defaultDataSourceForSlot(s.composerSlot);
    slotDataSources[s.composerSlot] = source;
    slotMax[s.composerSlot] = s.max;
    if (source === "popular_menu") {
      slotPopularityWindowDays[s.composerSlot] = resolvePopularityWindowDays(
        s.productConfig.popularityWindowDays
      );
    }
  }
  return {
    purposeAllocationOrder,
    slotDataSources,
    slotMax,
    slotPopularityWindowDays,
    popularityCountsByDays: deserializeCountsByDays(overlay),
  };
}
