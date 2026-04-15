import {
  toCategoryWithSettings,
  mapChildCategoryRow,
  type CategoryDbRow,
} from "@/lib/categories/to-category-with-settings";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { PostWithMeta } from "@/lib/posts/schema";
import { buildMarketBootstrapQueryKey } from "@/lib/market/build-market-bootstrap-query-key";
import type { MarketBootstrapPayload } from "@/lib/market/load-market-bootstrap-payload";

export type TradeCategoryServerSeed = {
  queryKey: string;
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

export function tradeServerSeedFromBootstrapPayload(
  slugParam: string,
  topic: string,
  jk: string | null,
  payload: MarketBootstrapPayload
): TradeCategoryServerSeed {
  const queryKey = buildMarketBootstrapQueryKey(slugParam, topic, jk);
  const category = toCategoryWithSettings(payload.category as unknown as CategoryDbRow);
  const children = (payload.children as unknown as CategoryDbRow[]).map(mapChildCategoryRow);
  return {
    queryKey,
    category,
    tradeBootstrapChildren: children,
    tradeBootstrapChildrenForFilter: payload.childrenForFilter,
    tradeBootstrapFeed: payload.initialFeed ?? null,
  };
}
