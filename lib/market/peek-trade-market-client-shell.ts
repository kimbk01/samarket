import { readCategoryCache } from "@/lib/categories/category-memory-cache";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { readFreshTradeFeedClientCache } from "@/lib/posts/getPostsByCategory";
import { computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import type { TradeFeedClientSort } from "@/lib/posts/trade-feed-client-cache";
import type { PostWithMeta } from "@/lib/posts/schema";

const CATEGORY_BY_KEY_TTL_MS = 60_000;
const CHILDREN_CACHE_TTL_MS = 45_000;

export type TradeMarketClientShell = {
  category: CategoryWithSettings;
  tradeBootstrapChildren: CategoryWithSettings[];
  tradeBootstrapChildrenForFilter: { id: string; slug: string | null }[];
  tradeBootstrapFeed: {
    posts: PostWithMeta[];
    hasMore: boolean;
    feedKey: string;
    favoriteMap?: Record<string, boolean>;
  } | null;
};

/**
 * 마켓 1차 탭 전환 — RSC·부트스트랩 대기 없이 즉시 페인트할 클라이언트 셸.
 * 카테고리·피드 캐시가 없으면 null (그때만 loading 경로).
 */
export function peekTradeMarketClientShell(
  slugOrId: string,
  opts?: { topic?: string; sort?: TradeFeedClientSort }
): TradeMarketClientShell | null {
  const rawTrim = slugOrId.trim();
  const id = normalizeMarketSlugParam(slugOrId);
  if (!id) return null;

  const cacheKey = `cat:${id}:${rawTrim}`;
  const category = readCategoryCache<CategoryWithSettings>(cacheKey, CATEGORY_BY_KEY_TTL_MS);
  if (!category || category.type !== "trade") return null;

  const children = readCategoryCache<CategoryWithSettings[]>(`children:${category.id}`, CHILDREN_CACHE_TTL_MS) ?? [];
  const childrenForFilter = children
    .map((c) => ({
      id: c.id,
      slug: c.slug?.trim() || null,
    }))
    .filter((r) => r.id.length > 0);

  const topic = (opts?.topic ?? "").trim().normalize("NFC");
  const sort = opts?.sort ?? "latest";
  const feedOpts = {
    page: 1 as const,
    sort,
    tradeMarketParent: category.id,
    topic: topic || "",
  };
  const cached = readFreshTradeFeedClientCache([], feedOpts);
  const feedKey = computeTradeFeedKeyForMarketParent(category.id, topic, sort, undefined);

  return {
    category,
    tradeBootstrapChildren: children,
    tradeBootstrapChildrenForFilter: childrenForFilter,
    tradeBootstrapFeed: cached
      ? {
          posts: cached.posts,
          hasMore: cached.hasMore,
          feedKey,
          favoriteMap: cached.favoriteMap,
        }
      : null,
  };
}
