import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export type StoresHomeFeedSections = {
  openNow: StoreHomeFeedItem[];
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
  etaLabel: string | null;
  rating: number;
};

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

/** 홈 피드 단일 분할 — browse `splitFeedSections` 확장 */
export function splitStoresHomeFeed(stores: StoreHomeFeedItem[]): StoresHomeFeedSections {
  const seen = new Set<string>();
  const openNow = pullUnique(stores, seen, (s) => s.status === "open" && s.deliveryAvailable);
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
  return { openNow, premium, topRated, discounted, nearby, feedRest };
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
