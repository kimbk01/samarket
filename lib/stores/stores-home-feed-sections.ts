import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  sortStoreDiscoveryPopularRows,
  type StorePopularitySortRow,
} from "@/lib/stores/store-discovery-popular-store";

export type StoresHomeFeedSections = {
  openNow: StoreHomeFeedItem[];
  popularStores: StoreHomeFeedItem[];
  premium: StoreHomeFeedItem[];
  topRated: StoreHomeFeedItem[];
  discounted: StoreHomeFeedItem[];
  nearby: StoreHomeFeedItem[];
  feedRest: StoreHomeFeedItem[];
};

export type StoresHomeFoodEntry = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  productId: string;
  name: string;
  price: number;
  /** home-feed featuredItems[].imageUrl — 레일 즉시 썸네일 */
  imageUrl: string | null;
  etaLabel: string | null;
  rating: number;
};

/** Popular discovery rail — canonical ranking cap */
export const STORES_HOME_POPULAR_SHELF_MAX = 20;

/**
 * Primary row dedupe preference only — not a hard exclusion.
 * Fewer non-primary popular candidates → backfill from full canonical list (primary overlap OK).
 */
export const STORES_HOME_POPULAR_DEDUPE_MIN_WITHOUT_PRIMARY = 3;

function pullUnique(
  stores: StoreHomeFeedItem[],
  seen: Set<string>,
  pred: (s: StoreHomeFeedItem) => boolean,
  max = 40
): StoreHomeFeedItem[] {
  const out: StoreHomeFeedItem[] = [];
  for (const s of stores) {
    if (out.length >= max) break;
    if (seen.has(s.id) || !pred(s)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** above-the-fold 「지금 주문」 레일 — 전체 `splitStoresHomeFeed` 없이 open 매장만 */
export function pickStoresHomeOpenNow(stores: StoreHomeFeedItem[], max = 40): StoreHomeFeedItem[] {
  const seen = new Set<string>();
  return pullUnique(stores, seen, (s) => s.status === "open" && s.deliveryAvailable, max);
}

function homeFeedItemToPopularitySortRow(s: StoreHomeFeedItem): StorePopularitySortRow {
  return {
    id: s.id,
    slug: s.slug,
    district: null,
    rating_avg: s.rating,
    review_count: s.reviewCount,
    completedOrderCount30d: s.completedOrderCount30d ?? 0,
  };
}

/**
 * Canonical popular shelf — eligibility → completedOrderCount30d → rating → reviews → tie.
 * Independent of primary row / openNow seen.
 */
export function buildStoresHomePopularShelf(
  stores: StoreHomeFeedItem[],
  primaryIds: ReadonlySet<string>,
  max = STORES_HOME_POPULAR_SHELF_MAX
): StoreHomeFeedItem[] {
  const withOrders = stores.filter((s) => (s.completedOrderCount30d ?? 0) > 0);
  if (withOrders.length === 0) return [];

  const popularRankById = new Map(
    stores.map((s) => [s.id, s.discoveryEligibilityRank ?? 99])
  );
  const popularSortedRows = sortStoreDiscoveryPopularRows(
    withOrders.map(homeFeedItemToPopularitySortRow),
    popularRankById
  );
  const popularIdOrder = new Map(popularSortedRows.map((r, i) => [r.id, i]));
  const popularCanonical = [...withOrders].sort(
    (a, b) => (popularIdOrder.get(a.id) ?? 999) - (popularIdOrder.get(b.id) ?? 999)
  );

  const withoutPrimary = popularCanonical.filter((s) => !primaryIds.has(s.id));
  if (withoutPrimary.length >= STORES_HOME_POPULAR_DEDUPE_MIN_WITHOUT_PRIMARY) {
    return withoutPrimary.slice(0, max);
  }

  const bestRank = Math.min(...popularCanonical.map((s) => s.discoveryEligibilityRank ?? 99));
  const bestBand = popularCanonical.filter((s) => (s.discoveryEligibilityRank ?? 99) === bestRank);
  const worseBand = popularCanonical.filter((s) => (s.discoveryEligibilityRank ?? 99) > bestRank);

  const overlapShelf = bestBand.slice(0, max);
  if (overlapShelf.length >= STORES_HOME_POPULAR_DEDUPE_MIN_WITHOUT_PRIMARY || worseBand.length === 0) {
    return overlapShelf;
  }

  return [...bestBand, ...worseBand].slice(0, max);
}

/**
 * 홈 피드 단일 분할.
 *
 * DEDUPE POLICY (P1-A):
 * - openNow / popularStores: 각각 canonical metric으로 **독립** 계산 (global seen 공유 금지).
 * - popularStores: primary row ID 제거는 presentation preference — 후보 부족 시 canonical backfill(중복 허용).
 * - premium / discounted / topRated / nearby / rest: presentation `seen` — openNow+popularStores 이후 leftover 배치.
 */
export function splitStoresHomeFeed(stores: StoreHomeFeedItem[]): StoresHomeFeedSections {
  const openNow = pickStoresHomeOpenNow(stores);
  const primaryIds = new Set(openNow.map((s) => s.id));
  const popularStores = buildStoresHomePopularShelf(stores, primaryIds);

  const seen = new Set<string>();
  for (const s of openNow) seen.add(s.id);
  for (const s of popularStores) seen.add(s.id);

  const premium = pullUnique(stores, seen, (s) => s.isFeatured);
  const discounted = pullUnique(
    stores,
    seen,
    (s) => s.deliveryFeeStrikePhp != null && Number(s.deliveryFeeStrikePhp) > 0
  );
  const topRated = pullUnique(stores, seen, (s) => s.rating >= 4 && s.reviewCount >= 3, 20);
  const nearby = [...stores]
    .filter((s) => !seen.has(s.id) && s.distanceKm != null)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, 24);
  for (const s of nearby) seen.add(s.id);
  const feedRest = stores.filter((s) => !seen.has(s.id));
  return { openNow, popularStores, premium, topRated, discounted, nearby, feedRest };
}

/** 가로 음식 레일 — 매장별 첫 featured 메뉴 */
export function flattenStoresHomeFoodEntries(
  stores: StoreHomeFeedItem[],
  max = 24
): StoresHomeFoodEntry[] {
  const out: StoresHomeFoodEntry[] = [];
  for (const s of stores) {
    if (out.length >= max) break;
    const item = s.featuredItems[0];
    if (!item) continue;
    out.push({
      storeId: s.id,
      storeSlug: s.slug,
      storeName: s.nameKo,
      productId: item.productId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl?.trim() || null,
      etaLabel: s.etaLabel ?? null,
      rating: s.rating,
    });
  }
  return out;
}

/** 동네 ETA 요약 — location bar 보조 */
export function summarizeHomeFeedEta(stores: StoreHomeFeedItem[]): string | null {
  const open = stores.filter((s) => s.status === "open" && s.deliveryAvailable);
  const sample = open[0]?.etaLabel?.trim();
  return sample || null;
}
