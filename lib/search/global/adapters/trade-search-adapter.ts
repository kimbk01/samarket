import { postsToSearchProducts } from "@/lib/search/post-with-meta-to-product";
import { GLOBAL_SEARCH_TRADE_API_PATH } from "@/lib/search/global/trade-match-only";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { SEARCH_REST_SECTION } from "@/lib/trade/marketplace/list-contract/list-section-keys";
import {
  appendMarketplaceLocationSearchParams,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import type { Product } from "@/lib/types/product";
import type { PostWithMeta } from "@/lib/posts/schema";

export type TradeSearchAdapterResult =
  /** `noMatch`: 검색어와 일치하는 거래 글이 없어 나머지 글을 보여 주는 중(목록 계약 §4) */
  | { ok: true; products: Product[]; noMatch: boolean }
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
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { ok: true, products: [], noMatch: false };
  if (!input.canFetch) return { ok: true, products: [], noMatch: false };
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
    /**
     * 목록 계약 §5: 거래 화면 찾기와 같은 순서 그대로(제목 재필터 없음).
     * 첫 글이 「나머지」 구간이면 일치하는 글이 없다는 뜻.
     */
    const noMatch = posts.length > 0 && String(posts[0]?.list_section ?? "").startsWith(SEARCH_REST_SECTION);
    return { ok: true, products: postsToSearchProducts(posts), noMatch };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
