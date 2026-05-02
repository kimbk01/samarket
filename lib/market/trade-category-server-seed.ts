import {
  toCategoryWithSettings,
  mapChildCategoryRow,
  type CategoryDbRow,
} from "@/lib/categories/to-category-with-settings";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { PostWithMeta } from "@/lib/posts/schema";
import { buildMarketBootstrapQueryKey } from "@/lib/market/build-market-bootstrap-query-key";
import type { MarketBootstrapPayload } from "@/lib/market/load-market-bootstrap-payload";
import { isTradeJobMarketCategory } from "@/lib/market/is-trade-job-market-category";

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
  payload: MarketBootstrapPayload,
  feedQueryExtras?: {
    fs?: string | null;
    je?: string | null;
    avail?: string | null;
    jr?: string | null;
    jc?: string | null;
  }
): TradeCategoryServerSeed {
  const category = toCategoryWithSettings(payload.category as unknown as CategoryDbRow);
  const queryKey = buildMarketBootstrapQueryKey(
    slugParam,
    topic,
    jk,
    feedQueryExtras?.fs,
    feedQueryExtras?.je,
    feedQueryExtras?.avail,
    feedQueryExtras?.jr,
    feedQueryExtras?.jc,
    { omitJobListFilters: !isTradeJobMarketCategory(category) }
  );
  const children = (payload.children as unknown as CategoryDbRow[]).map(mapChildCategoryRow);
  return {
    queryKey,
    category,
    tradeBootstrapChildren: children,
    tradeBootstrapChildrenForFilter: payload.childrenForFilter,
    tradeBootstrapFeed: payload.initialFeed ?? null,
  };
}
