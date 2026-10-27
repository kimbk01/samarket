import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import {
  resolveHomePostsPayload,
  resolveHomePostsStatusOrByTradeState,
  type HomePostsQueryType,
} from "@/lib/posts/home-posts-query-server";
import type { PostWithMeta } from "@/lib/posts/schema";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { expandTradeCategoryIdsForAllConfiguredHomeRoots } from "@/lib/trade/trade-market-catalog";
import { shouldApplyMixedDiscoverySellIntent } from "@/lib/trade/marketplace/sell-intent-list-ssot";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { matchTradeGlobalSearch } from "@/lib/search/global/semantics/domain-fields";
import {
  GLOBAL_SEARCH_TRADE_LIMIT,
  GLOBAL_SEARCH_TRADE_MATCH_FIELD,
} from "@/lib/search/global/trade-match-only";

export type GlobalSearchTradeMatchOnlyResult = {
  ok: true;
  posts: PostWithMeta[];
  hasMore: boolean;
  matchField: typeof GLOBAL_SEARCH_TRADE_MATCH_FIELD;
};

/** DB 조회 실패 — 「결과 없음」으로 위장하지 않는다 (LS-11 · TM-28) */
export type GlobalSearchTradeMatchOnlyFailure = { ok: false; error: "trade_search_unavailable" };

function isConfiguredTradeUnionEnabledForHomeAll(): boolean {
  const v = (process.env.HOME_POSTS_CONFIGURED_TRADE_UNION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizePage(raw: string | null): number {
  const page = Number(raw);
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

/**
 * Title-ILIKE match-only fetch. Never CUT C ranked window / T5 eligible tail.
 * Location eligibility is AND with keyword — not a substitute for match.
 */
export async function fetchGlobalSearchTradeMatchOnlyPosts(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  input: {
    q: string;
    page?: number;
    lguCityId?: string | null;
    radiusKm?: number | null;
  }
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const keyword = sanitizeMarketplaceQueryText(input.q);
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { posts: [], hasMore: false };

  const page = Math.max(1, Math.floor(input.page ?? 1));
  const from = (page - 1) * GLOBAL_SEARCH_TRADE_LIMIT;

  let tradeCategoryIds: string[] | null = null;
  let effectiveType: HomePostsQueryType = null;
  if (isConfiguredTradeUnionEnabledForHomeAll()) {
    const union = await expandTradeCategoryIdsForAllConfiguredHomeRoots(
      readSb as SupabaseClient<any>,
      serviceSb as SupabaseClient<any> | null
    );
    if (union.length > 0) {
      tradeCategoryIds = union;
      effectiveType = "trade";
    }
  }

  const pack = await resolveHomePostsPayload(
    readSb,
    serviceSb,
    from,
    "latest",
    effectiveType,
    tradeCategoryIds,
    resolveHomePostsStatusOrByTradeState("latest"),
    input.lguCityId ?? null,
    input.radiusKm ?? null,
    {
      q: keyword,
      mixedDiscoverySellIntent: shouldApplyMixedDiscoverySellIntent({
        tradeMarketParent: null,
        type: effectiveType,
      }),
    },
    GLOBAL_SEARCH_TRADE_LIMIT
  );
  if (!pack) return null;

  await enrichPostsAuthorNicknamesFromProfiles(readSb, pack.posts);

  const posts = pack.posts
    .filter((post) => matchTradeGlobalSearch(post.title, keyword).matched)
    .slice(0, GLOBAL_SEARCH_TRADE_LIMIT);
  return {
    posts,
    hasMore: pack.hasMore === true || pack.posts.length > GLOBAL_SEARCH_TRADE_LIMIT,
  };
}

/**
 * 거래 목록 계약 §5 (Owner 2026-10-27): 상단 돋보기의 거래 결과 = 거래 화면 찾기(`/market?q=`)와
 * **같은 엔진·같은 순서**(검색어 단계 → 물품 → 옵션 → 가격 → 상태 → 지역 → 정렬). 앞 10건만 보여 준다.
 * 같은 검색어·지역 파라미터로 `/api/philife/posts` 처리기를 그대로 호출한다(순위 창 캐시도 같은 키).
 */
export async function resolveGlobalSearchTradeMatchOnly(
  req: NextRequest
): Promise<GlobalSearchTradeMatchOnlyResult | GlobalSearchTradeMatchOnlyFailure> {
  const empty: GlobalSearchTradeMatchOnlyResult = {
    ok: true,
    posts: [],
    hasMore: false,
    matchField: GLOBAL_SEARCH_TRADE_MATCH_FIELD,
  };
  const keyword = sanitizeMarketplaceQueryText(req.nextUrl.searchParams.get("q"));
  if (!keyword || !isSearchableGlobalQuery(keyword)) return empty;

  const listUrl = new URL("/api/philife/posts", req.nextUrl.origin);
  listUrl.searchParams.set("q", keyword);
  listUrl.searchParams.set("page", "1");
  for (const key of ["location", "lgu", "radius"]) {
    const v = req.nextUrl.searchParams.get(key);
    if (v != null && v !== "") listUrl.searchParams.set(key, v);
  }
  const listReq = new NextRequest(listUrl, { headers: req.headers });
  const data = await resolveHomePostsGetData(listReq);
  if (data.queryFailed) return { ok: false, error: "trade_search_unavailable" };
  return {
    ok: true,
    posts: data.posts.slice(0, GLOBAL_SEARCH_TRADE_LIMIT),
    hasMore: data.posts.length > GLOBAL_SEARCH_TRADE_LIMIT || data.hasMore,
    matchField: GLOBAL_SEARCH_TRADE_MATCH_FIELD,
  };
}
