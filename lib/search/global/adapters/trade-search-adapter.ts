import { GLOBAL_SEARCH_TRADE_API_PATH } from "@/lib/search/global/trade-match-only";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import {
  appendMarketplaceLocationSearchParams,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import type { PostWithMeta } from "@/lib/posts/schema";

export type TradeSearchAdapterResult =
  /** 검색어와 일치하는 거래 글만(재설계 4-1-4) — 거래 목록과 같은 카드(PostCard)로 그린다 */
  | { ok: true; posts: PostWithMeta[] }
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
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { ok: true, posts: [] };
  if (!input.canFetch) return { ok: true, posts: [] };
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
    return { ok: true, posts: Array.isArray(json.posts) ? json.posts : [] };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
