import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { sortStoreDiscoveryPopularRows } from "@/lib/stores/store-discovery-popular-store";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import {
  StoresHomeExposureRegistry,
  type StoresHomeExposureRole,
} from "@/lib/stores/stores-home-exposure-registry";

/**
 * Slot0 「지금 주문 가능」 가로 레일 cap — 기존 Hub `flattenStoresHomeFoodEntries(..., 16)` 계약.
 */
export const STORES_HOME_SLOT0_FOOD_MAX = 16;

/** Slot2 popular shelf cap */
export const STORES_HOME_POPULAR_SHELF_MAX = 20;

/** Slot4 rating shelf cap */
export const STORES_HOME_TOP_RATED_SHELF_MAX = 20;

/** Slot6 nearby cap — legacy split contract */
export const STORES_HOME_NEARBY_MAX = 24;

/** Slot5 featured grid cap */
export const STORES_HOME_SLOT5_FOOD_MAX = 8;

/** Existing authoritative threshold — not invented in CUT3 */
export const STORES_HOME_TOP_RATED_MIN_RATING = 4;
export const STORES_HOME_TOP_RATED_MIN_REVIEWS = 3;

/** horizontal shelf — Slot0/1 노출 store deprioritize (영구 제외 아님) */
const HORIZONTAL_DEPRIORITIZE_ROLES: readonly StoresHomeExposureRole[] = [
  "slot0_product",
  "slot1_primary",
];

export type StoresHomeFeedComposition = {
  slot0Food: StoresHomeFoodEntry[];
  slot1Stores: StoreHomeFeedItem[];
  slot2Food: StoresHomeFoodEntry[];
  slot3Food: StoresHomeFoodEntry[];
  slot4Food: StoresHomeFoodEntry[];
  slot5Food: StoresHomeFoodEntry[];
  slot6NearbyStores: StoreHomeFeedItem[];
  slot6RestStores: StoreHomeFeedItem[];
};

function isOpenDeliverable(store: StoreHomeFeedItem): boolean {
  return store.status === "open" && store.deliveryAvailable;
}

function hasDeliveryFeeStrikeEvidence(store: StoreHomeFeedItem): boolean {
  const strike = store.deliveryFeeStrikePhp;
  return strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0;
}

function isTopRatedCandidate(store: StoreHomeFeedItem): boolean {
  return store.rating >= STORES_HOME_TOP_RATED_MIN_RATING && store.reviewCount >= STORES_HOME_TOP_RATED_MIN_REVIEWS;
}

function buildRepresentativeFoodEntry(store: StoreHomeFeedItem): StoresHomeFoodEntry | null {
  const item = store.featuredItems[0];
  if (!item?.productId) return null;

  const strike = store.deliveryFeeStrikePhp;
  const discountEvidence =
    strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0 ?
      "delivery_fee_strike"
    : null;

  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.nameKo,
    productId: item.productId,
    name: item.name,
    price: item.price,
    imageUrl: item.imageUrl?.trim() || null,
    etaLabel: store.etaLabel?.trim() || null,
    rating: store.rating,
    deliveryFeeLabel: store.deliveryFeeLabel?.trim() || null,
    deliveryFeeStrikePhp: strike ?? null,
    discountEvidence,
  };
}

/** Slot0 — strict one store one product */
function allocateSlot0Food(
  registry: StoresHomeExposureRegistry,
  stores: readonly StoreHomeFeedItem[],
  max: number
): StoresHomeFoodEntry[] {
  const out: StoresHomeFoodEntry[] = [];
  for (const store of stores) {
    if (out.length >= max) break;
    const entry = buildRepresentativeFoodEntry(store);
    if (!entry) continue;

    registry.registerStore(store.id, "slot0_product");
    registry.registerProduct(entry.productId);
    out.push(entry);
  }
  return out;
}

function deprioritizeByRoles(
  stores: readonly StoreHomeFeedItem[],
  registry: StoresHomeExposureRegistry,
  roles: readonly StoresHomeExposureRole[]
): StoreHomeFeedItem[] {
  const fresh: StoreHomeFeedItem[] = [];
  const seen: StoreHomeFeedItem[] = [];
  for (const store of stores) {
    if (registry.wasExposedInRoles(store.id, roles)) seen.push(store);
    else fresh.push(store);
  }
  return [...fresh, ...seen];
}

function rotateAvoidAdjacentFirst(
  stores: readonly StoreHomeFeedItem[],
  avoidStoreIds: readonly string[]
): StoreHomeFeedItem[] {
  if (stores.length <= 1 || avoidStoreIds.length === 0) return [...stores];
  const avoid = new Set(avoidStoreIds);
  const altIdx = stores.findIndex((s) => !avoid.has(s.id));
  if (altIdx <= 0) return [...stores];
  const picked = stores[altIdx];
  return [picked, ...stores.slice(0, altIdx), ...stores.slice(altIdx + 1)];
}

/**
 * Horizontal discovery shelf — metric 후보 전체에서 선정.
 * Slot0/1 exposure는 deprioritize만; candidate 부족 시 shelf starvation 금지.
 */
function allocateHorizontalFoodShelf(
  registry: StoresHomeExposureRegistry,
  stores: readonly StoreHomeFeedItem[],
  max: number,
  avoidAdjacentIds: readonly string[]
): StoresHomeFoodEntry[] {
  const ordered = rotateAvoidAdjacentFirst(
    deprioritizeByRoles(stores, registry, HORIZONTAL_DEPRIORITIZE_ROLES),
    avoidAdjacentIds
  );

  const out: StoresHomeFoodEntry[] = [];
  for (const store of ordered) {
    if (out.length >= max) break;
    const entry = buildRepresentativeFoodEntry(store);
    if (!entry) continue;

  // 첫 카드 adjacent repeat — 대안 있으면 한 번 더 회전
    if (
      out.length === 0 &&
      avoidAdjacentIds.includes(store.id) &&
      ordered.length > 1
    ) {
      continue;
    }

    registry.registerStore(store.id, "horizontal_discovery");
    out.push(entry);
  }

  // adjacent only option이면 첫 후보 허용
  if (out.length === 0 && ordered.length > 0) {
    const store = ordered[0]!;
    const entry = buildRepresentativeFoodEntry(store);
    if (entry) {
      registry.registerStore(store.id, "horizontal_discovery");
      out.push(entry);
    }
  }

  return out;
}

function orderStoresByPopularMetric(stores: readonly StoreHomeFeedItem[]): StoreHomeFeedItem[] {
  if (stores.length <= 1) return [...stores];

  const popularRankById = new Map(
    stores.map((s) => [s.id, s.discoveryEligibilityRank ?? 99])
  );
  const sortRows = stores.map((s) => ({
    id: s.id,
    slug: s.slug,
    district: null,
    rating_avg: s.rating,
    review_count: s.reviewCount,
    completedOrderCount30d: s.completedOrderCount30d ?? 0,
  }));
  const sorted = sortStoreDiscoveryPopularRows(sortRows, popularRankById);
  const order = new Map(sorted.map((r, i) => [r.id, i]));
  return [...stores].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

function buildAdjacentAvoidIds(
  registry: StoresHomeExposureRegistry,
  slot1Stores: readonly StoreHomeFeedItem[]
): string[] {
  const ids: string[] = [];
  const lastPrimary = slot1Stores.at(-1)?.id;
  if (lastPrimary) ids.push(lastPrimary);
  const lastHoriz = registry.lastHorizontalStoreId;
  if (lastHoriz) ids.push(lastHoriz);
  return ids;
}

/**
 * HOME feed composer — single invocation per feed render.
 * Input `stores` must preserve API recommended + exposure order.
 */
export function composeStoresHomeFeed(stores: readonly StoreHomeFeedItem[]): StoresHomeFeedComposition {
  const registry = new StoresHomeExposureRegistry();
  const pool = [...stores];

  const slot0Candidates = pool.filter(isOpenDeliverable);
  const slot0Food = allocateSlot0Food(registry, slot0Candidates, STORES_HOME_SLOT0_FOOD_MAX);

  const slot1Stores: StoreHomeFeedItem[] = [];
  for (const store of pool) {
    if (registry.isInSlot0(store.id)) continue;
    registry.registerStore(store.id, "slot1_primary");
    slot1Stores.push(store);
  }

  const adjacentAvoid = buildAdjacentAvoidIds(registry, slot1Stores);

  const popularCandidates = pool.filter((s) => (s.completedOrderCount30d ?? 0) > 0);
  const popularOrdered = orderStoresByPopularMetric(popularCandidates);
  const slot2Food = allocateHorizontalFoodShelf(
    registry,
    popularOrdered,
    STORES_HOME_POPULAR_SHELF_MAX,
    adjacentAvoid
  );

  const discountCandidates = pool.filter((s) => hasDeliveryFeeStrikeEvidence(s));
  const slot3Food = allocateHorizontalFoodShelf(
    registry,
    discountCandidates,
    STORES_HOME_POPULAR_SHELF_MAX,
    buildAdjacentAvoidIds(registry, slot1Stores)
  );

  const ratingCandidates = pool.filter((s) => isTopRatedCandidate(s));
  const slot4Food = allocateHorizontalFoodShelf(
    registry,
    ratingCandidates,
    STORES_HOME_TOP_RATED_SHELF_MAX,
    buildAdjacentAvoidIds(registry, slot1Stores)
  );

  const featuredCandidates = pool.filter((s) => s.isFeatured);
  const slot5Food = allocateHorizontalFoodShelf(
    registry,
    featuredCandidates,
    STORES_HOME_SLOT5_FOOD_MAX,
    buildAdjacentAvoidIds(registry, slot1Stores)
  );

  const finalRowExcludeRoles: readonly StoresHomeExposureRole[] = [
    "slot0_product",
    "slot1_primary",
    "horizontal_discovery",
  ];

  const nearbyCandidates = pool
    .filter(
      (s) => !registry.wasExposedInRoles(s.id, finalRowExcludeRoles) && s.distanceKm != null
    )
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, STORES_HOME_NEARBY_MAX);
  const slot6NearbyStores: StoreHomeFeedItem[] = [];
  for (const store of nearbyCandidates) {
    registry.registerStore(store.id, "final_row");
    slot6NearbyStores.push(store);
  }

  const slot6RestStores: StoreHomeFeedItem[] = [];
  for (const store of pool) {
    if (registry.wasExposedInRoles(store.id, finalRowExcludeRoles)) continue;
    registry.registerStore(store.id, "final_row");
    slot6RestStores.push(store);
  }

  return {
    slot0Food,
    slot1Stores,
    slot2Food,
    slot3Food,
    slot4Food,
    slot5Food,
    slot6NearbyStores,
    slot6RestStores,
  };
}
