import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import { postsToSearchProducts } from "@/lib/search/post-with-meta-to-product";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import type { Product } from "@/lib/types/product";

export type TradeSearchAdapterResult =
  | { ok: true; products: Product[] }
  | { ok: false };

export async function searchTradeForGlobal(
  q: string,
  input: {
    signal: AbortSignal;
    locationAll?: boolean;
    lguCityId?: string | null;
    radiusKm?: number | null;
    canFetch: boolean;
  }
): Promise<TradeSearchAdapterResult> {
  const keyword = sanitizeMarketplaceQueryText(q);
  if (!keyword) return { ok: true, products: [] };
  if (!input.canFetch) return { ok: true, products: [] };
  try {
    const res = await getPostsForHome(
      {
        page: 1,
        sort: "latest",
        type: null,
        tradeState: "latest",
        q: keyword,
        locationAll: input.locationAll === true,
        lguCityId: input.lguCityId ?? null,
        radiusKm: input.radiusKm ?? null,
      },
      { signal: input.signal }
    );
    return { ok: true, products: postsToSearchProducts(res.posts ?? []) };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
