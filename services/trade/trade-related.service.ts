import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  getRecentTradePoolFromDb,
  getSellerItemsByNicknameFromDb,
  getSellerItemsFromDb,
  getSimilarPoolByCategoryFromDb,
  getTradeAdsCandidatesFromDb,
} from "@/repositories/trade.repository";
import {
  isGlobalRegion,
  matchRegionGroupOrGlobal,
  matchRegionOrGlobal,
  resolveRegionGroup,
} from "./trade-region.service";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

export type TradeDetailRelatedBundle = {
  sellerItems: PostWithMeta[];
  similarItems: PostWithMeta[];
  ads: PostWithMeta[];
};

const RELATED_CACHE_TTL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const similarCache = new Map<string, { expiresAt: number; rows: PostWithMeta[] }>();
const adsCache = new Map<string, { expiresAt: number; rows: PostWithMeta[] }>();

function uniqPosts(rows: PostWithMeta[]): PostWithMeta[] {
  const out: PostWithMeta[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function pickWithinLimit(rows: PostWithMeta[], limit: number): PostWithMeta[] {
  if (limit <= 0) return [];
  return uniqPosts(rows).slice(0, limit);
}

function applyCompletedVisibilityRetention(rows: PostWithMeta[], visibleDays: number): PostWithMeta[] {
  const days = Math.max(1, Math.floor(visibleDays || 1));
  const now = Date.now();
  return rows.filter((row) => {
    const state = normalizeSellerListingState(row.seller_listing_state, row.status);
    if (state !== "completed") return true;
    const timeText = row.updated_at ?? row.created_at ?? "";
    const t = Date.parse(timeText);
    if (!Number.isFinite(t)) return false;
    return now - t <= days * DAY_MS;
  });
}

function pickSimilarByFallback(
  pool: PostWithMeta[],
  input: {
    categoryId: string | null | undefined;
    regionId: string | null | undefined;
    regionEnabled?: boolean;
    regionRequired?: boolean;
    regionGroups?: Record<string, string> | null;
    limit: number;
  }
): PostWithMeta[] {
  const categoryId = input.categoryId?.trim() ?? "";
  const regionId = input.regionEnabled ? input.regionId?.trim() ?? "" : "";
  const limit = Math.max(1, input.limit);

  const sameCategory = categoryId
    ? pool.filter((p) => {
        const c1 = p.category_id?.trim() ?? "";
        const c2 = p.trade_category_id?.trim() ?? "";
        return c1 === categoryId || c2 === categoryId;
      })
    : [];

  if (sameCategory.length >= limit) {
    return pickWithinLimit(sameCategory, limit);
  }

  const sameRegion = regionId
    ? pool.filter((p) =>
        input.regionRequired ? (p.region?.trim() ?? "") === regionId : matchRegionOrGlobal(p.region, regionId)
      )
    : pool;

  const sameRegionGroup = regionId
    ? pool.filter((p) =>
        input.regionRequired
          ? (p.region?.trim() ?? "") !== "" &&
            matchRegionGroupOrGlobal(p.region, regionId, input.regionGroups)
          : matchRegionGroupOrGlobal(p.region, regionId, input.regionGroups)
      )
    : pool;

  const merged = uniqPosts([
    ...sameCategory,
    ...sameRegion,
    ...sameRegionGroup,
    ...pool,
  ]);
  return merged.slice(0, limit);
}

function pickAdsByFallback(
  adsPool: PostWithMeta[],
  input: {
    categoryId: string | null | undefined;
    regionId: string | null | undefined;
    regionEnabled?: boolean;
    regionRequired?: boolean;
    regionGroups?: Record<string, string> | null;
    limit: number;
  }
): PostWithMeta[] {
  const categoryId = input.categoryId?.trim() ?? "";
  const regionId = input.regionEnabled ? input.regionId?.trim() ?? "" : "";
  const limit = Math.max(1, input.limit);
  const globalTarget = isGlobalRegion(regionId);

  const tier1 = adsPool.filter((p) => {
    const sameCategory =
      !categoryId ||
      p.category_id?.trim() === categoryId ||
      p.trade_category_id?.trim() === categoryId;
    if (!sameCategory) return false;
    if (globalTarget) return true;
    if (input.regionRequired) {
      const candidateRegion = p.region?.trim() ?? "";
      return (
        (candidateRegion !== "" && candidateRegion === regionId) ||
        (candidateRegion !== "" &&
          matchRegionGroupOrGlobal(candidateRegion, regionId, input.regionGroups))
      );
    }
    return matchRegionOrGlobal(p.region, regionId) || matchRegionGroupOrGlobal(p.region, regionId, input.regionGroups);
  });
  if (tier1.length >= limit) return pickWithinLimit(tier1, limit);

  const tier2 = adsPool.filter((p) => {
    if (!categoryId) return true;
    return p.category_id?.trim() === categoryId || p.trade_category_id?.trim() === categoryId;
  });
  if (tier2.length >= limit) return pickWithinLimit(uniqPosts([...tier1, ...tier2]), limit);

  return pickWithinLimit(uniqPosts([...tier1, ...tier2, ...adsPool]), limit);
}

function readCache(
  cache: Map<string, { expiresAt: number; rows: PostWithMeta[] }>,
  key: string
): PostWithMeta[] | null {
  const now = Date.now();
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit.rows;
}

function writeCache(
  cache: Map<string, { expiresAt: number; rows: PostWithMeta[] }>,
  key: string,
  rows: PostWithMeta[]
): void {
  cache.set(key, {
    expiresAt: Date.now() + RELATED_CACHE_TTL_MS,
    rows,
  });
}

export async function loadTradeDetailRelatedBundle(
  sb: SupabaseClient<any>,
  input: {
    itemId: string;
    sellerId: string | null | undefined;
    sellerNickname?: string | null | undefined;
    categoryId: string | null | undefined;
    regionId: string | null | undefined;
    sellerLimit: number;
    similarLimit: number;
    adsLimit: number;
    regionEnabled?: boolean;
    regionRequired?: boolean;
    regionGroups?: Record<string, string> | null;
    completedVisibleDays?: number;
  }
): Promise<TradeDetailRelatedBundle> {
  const itemId = input.itemId.trim();
  if (!itemId) {
    return { sellerItems: [], similarItems: [], ads: [] };
  }

  const sellerId = input.sellerId?.trim() ?? "";
  const sellerNickname = input.sellerNickname?.trim() ?? "";
  const categoryId = input.categoryId?.trim() ?? "";
  const regionId = input.regionId?.trim() ?? "";
  const regionGroupRev = input.regionGroups
    ? Object.entries(input.regionGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|")
    : "";
  const similarKey = `similar:${itemId}:${categoryId}:${regionId}:${input.similarLimit}:${regionGroupRev}`;
  const adsKey = `ads:${itemId}:${categoryId}:${regionId}:${input.adsLimit}:${regionGroupRev}`;

  const sellerItemsPromise = sellerId
    ? getSellerItemsFromDb(sb, {
        sellerId,
        excludePostId: itemId,
        limit: input.sellerLimit,
      })
    : Promise.resolve([] as PostWithMeta[]);
  const cachedSimilar = readCache(similarCache, similarKey);
  const cachedAds = readCache(adsCache, adsKey);
  const similarPoolPromise =
    cachedSimilar == null
      ? Promise.all([
          getSimilarPoolByCategoryFromDb(sb, {
            excludePostId: itemId,
            categoryId: input.categoryId,
          }),
          getRecentTradePoolFromDb(sb, {
            excludePostId: itemId,
          }),
        ])
      : Promise.resolve(null);
  const adsCandidatesPromise =
    cachedAds == null
      ? getTradeAdsCandidatesFromDb(sb, {
          excludePostId: itemId,
        })
      : Promise.resolve(null);

  const [sellerItemsRaw, similarPoolPair, adCandidates] = await Promise.all([
    sellerItemsPromise,
    similarPoolPromise,
    adsCandidatesPromise,
  ]);
  const sellerItemsFallback =
    sellerItemsRaw.length === 0 && sellerNickname
      ? await getSellerItemsByNicknameFromDb(sb, {
          nickname: sellerNickname,
          excludePostId: itemId,
          limit: input.sellerLimit,
        })
      : [];
  const sellerItemsResolved = sellerItemsRaw.length > 0 ? sellerItemsRaw : sellerItemsFallback;
  const sellerItemsUltimate =
    sellerItemsResolved.length > 0
      ? sellerItemsResolved
      : (similarPoolPair?.[1] ?? []).filter((p) => {
          if (sellerId && (p.user_id?.trim() ?? "") === sellerId) return true;
          if (sellerNickname && (p.author_nickname?.trim() ?? "") === sellerNickname) return true;
          return false;
        });
  const sellerItemsVisible = applyCompletedVisibilityRetention(
    sellerItemsUltimate,
    input.completedVisibleDays ?? 7
  );

  const similarItems =
    cachedSimilar ??
    (() => {
      const categoryPool = similarPoolPair?.[0] ?? [];
      const recentPool = similarPoolPair?.[1] ?? [];
      const baseSimilarPool = uniqPosts([...categoryPool, ...recentPool]);
      const next = pickSimilarByFallback(baseSimilarPool, {
        categoryId: input.categoryId,
        regionId: input.regionId,
        regionEnabled: input.regionEnabled,
        regionRequired: input.regionRequired,
        regionGroups: input.regionGroups,
        limit: input.similarLimit,
      });
      writeCache(similarCache, similarKey, next);
      return next;
    })();
  const similarItemsVisible = applyCompletedVisibilityRetention(
    similarItems,
    input.completedVisibleDays ?? 7
  );

  const adsItems =
    cachedAds ??
    (() => {
      const next = pickAdsByFallback(adCandidates?.posts ?? [], {
        categoryId: input.categoryId,
        regionId: input.regionId,
        regionEnabled: input.regionEnabled,
        regionRequired: input.regionRequired,
        regionGroups: input.regionGroups,
        limit: input.adsLimit,
      });
      writeCache(adsCache, adsKey, next);
      return next;
    })();

  return {
    sellerItems: pickWithinLimit(sellerItemsVisible, input.sellerLimit),
    similarItems: pickWithinLimit(similarItemsVisible, input.similarLimit),
    ads: adsItems,
  };
}

export type TradeRegionResolution = {
  regionId: string | null;
  regionGroup: string | null;
};

export function resolveTradeRegion(input: {
  regionId: string | null | undefined;
  regionGroups?: Record<string, string> | null;
}): TradeRegionResolution {
  const regionId = input.regionId?.trim() || null;
  return {
    regionId,
    regionGroup: resolveRegionGroup(regionId, input.regionGroups),
  };
}
