import { postsToSearchProducts } from "@/lib/search/post-with-meta-to-product";
import { GLOBAL_SEARCH_TRADE_API_PATH } from "@/lib/search/global/trade-match-only";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { matchTradeGlobalSearch } from "@/lib/search/global/semantics/domain-fields";
import {
  appendMarketplaceLocationSearchParams,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import type { Product } from "@/lib/types/product";
import type { PostWithMeta } from "@/lib/posts/schema";

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
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { ok: true, products: [] };
  if (!input.canFetch) return { ok: true, products: [] };
  try {
    const params = new URLSearchParams();
    params.set("q", keyword);
    params.set("page", "1");
    appendMarketplaceLocationSearchParams(params, {
      locationAll: input.locationAll === true,
      lguCityId: input.lguCityId ?? null,
      radiusKm: input.radiusKm ?? null,
    });
    const res = await fetch(`${GLOBAL_SEARCH_TRADE_API_PATH}?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal: input.signal,
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { ok?: boolean; posts?: PostWithMeta[] };
    if (json.ok === false) return { ok: false };
    const posts = Array.isArray(json.posts) ? json.posts : [];
    return {
      ok: true,
      products: postsToSearchProducts(posts).filter((product) =>
        matchTradeGlobalSearch(product.title, keyword).matched
      ),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
