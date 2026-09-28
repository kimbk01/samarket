import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
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
): Promise<{ posts: PostWithMeta[]; hasMore: boolean }> {
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
  if (!pack) return { posts: [], hasMore: false };

  await enrichPostsAuthorNicknamesFromProfiles(readSb, pack.posts);

  const posts = pack.posts
    .filter((post) => matchTradeGlobalSearch(post.title, keyword).matched)
    .slice(0, GLOBAL_SEARCH_TRADE_LIMIT);
  return {
    posts,
    hasMore: pack.hasMore === true || pack.posts.length > GLOBAL_SEARCH_TRADE_LIMIT,
  };
}

export async function resolveGlobalSearchTradeMatchOnly(
  req: NextRequest
): Promise<GlobalSearchTradeMatchOnlyResult> {
  const empty: GlobalSearchTradeMatchOnlyResult = {
    ok: true,
    posts: [],
    hasMore: false,
    matchField: GLOBAL_SEARCH_TRADE_MATCH_FIELD,
  };
  const keyword = sanitizeMarketplaceQueryText(req.nextUrl.searchParams.get("q"));
  if (!keyword || !isSearchableGlobalQuery(keyword)) return empty;

  const clients = resolvePostsReadClients(req);
  if (!clients) return empty;

  const { searchParams } = req.nextUrl;
  const locationScope = parseTradeLocationScopeFromSearchParams(searchParams);
  const lguCityId =
    locationScope.mode === "city"
      ? locationScope.lguId
      : locationScope.mode === "invalid"
        ? locationScope.raw || "invalid"
        : null;
  const radiusKm = locationScope.mode === "city" ? locationScope.radiusKm : null;

  const loaded = await fetchGlobalSearchTradeMatchOnlyPosts(clients.readSb, clients.serviceSb, {
    q: keyword,
    page: normalizePage(searchParams.get("page")),
    lguCityId,
    radiusKm,
  });
  return {
    ok: true,
    posts: loaded.posts,
    hasMore: loaded.hasMore,
    matchField: GLOBAL_SEARCH_TRADE_MATCH_FIELD,
  };
}
