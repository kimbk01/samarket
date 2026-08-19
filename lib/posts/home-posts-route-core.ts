/**
 * `/api/philife/posts` GET 과 동일한 조회 로직 — RSC 시드와 공유해 첫 페인트 중복 요청을 줄인다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { PostWithMeta } from "@/lib/posts/schema";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  resolvePostsReadClients,
  resolvePostsReadClientsForServerComponent,
} from "@/lib/supabase/resolve-posts-read-clients";
import {
  HOME_POSTS_PAGE_SIZE,
  expandTradeMarketCategoryFilterIds,
  resolveHomePostsStatusOrByTradeState,
  resolveHomePostsPayload,
  resolveSearchExpansionRound,
  type HomePostsQuerySort,
  type HomePostsTradeStateFilter,
  type HomePostsQueryType,
} from "@/lib/posts/home-posts-query-server";
import { resolveTradeMarketParentParam } from "@/lib/posts/resolve-trade-market-parent-param";
import { expandTradeCategoryIdsForAllConfiguredHomeRoots } from "@/lib/trade/trade-market-catalog";
import { resolveMarketplaceMembershipIdsForRoots } from "@/lib/trade/marketplace/resolve-marketplace-membership";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadSearchTopicGraphContext } from "@/lib/trade/marketplace/load-search-topic-graph-context";
import { getPostFavoriteMutationEpochForViewer } from "@/lib/posts/post-favorites-viewer-mutation-epoch";
import {
  applyTradeHomePromotionProjection,
  tradePromotionPageIndexFromRequestPage,
} from "@/lib/promotion/feed-promotion-projection";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { tradeBrowseRadiusCacheSegment } from "@/lib/trade/location/trade-browse-radius";
import {
  marketplaceQueryCacheSegment,
  parseMarketplacePriceBound,
  parseMarketplaceSort,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import { compositionFilterCacheSegment } from "@/lib/trade/category-form/composition-filter-query";
import { resolveCompositionFilterQueryFromRequest } from "@/lib/trade/category-form/load-composition-for-filter";
import { shouldApplyMixedDiscoverySellIntent } from "@/lib/trade/marketplace/sell-intent-list-ssot";
import { shouldApplyMarketplaceSearchExpansion } from "@/lib/trade/marketplace/search-candidate-expansion";
import {
  buildSearchRankedWindowCacheKey,
  invalidateSearchRankedWindowSession,
  takeSearchRankedWindowPage,
} from "@/lib/trade/marketplace/search-ranked-window-cache";
import { isDibayMarketFreshFeedRequest } from "@/lib/trade/marketplace/market-fresh-feed-header";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
/** `HOME_POSTS_CONFIGURED_TRADE_UNION` — React 훅 아님(이름 `use*` 금지: eslint react-hooks/rules-of-hooks) */
function isConfiguredTradeUnionEnabledForHomeAll(): boolean {
  const v = (process.env.HOME_POSTS_CONFIGURED_TRADE_UNION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const HOME_POSTS_SERVER_CACHE_TTL_MS = 30_000;
const HOME_POSTS_FAVORITES_CACHE_TTL_MS = 12_000;

const homePostsServerCache = new Map<
  string,
  { posts: PostWithMeta[]; hasMore: boolean; expiresAt: number }
>();
const homePostsFavoriteCache = new Map<
  string,
  { favoriteMap: Record<string, boolean>; expiresAt: number; mutationEpoch: number }
>();

/** `invalidatePostFavoriteServerCachesForViewer` 가 키를 지울 때와 함께 쓰인다. */
export function clearHomePostsFavoriteCacheKeysForViewerPrefix(userId: string): void {
  const u = userId.trim();
  if (!u) return;
  const prefix = `${u}:`;
  for (const k of homePostsFavoriteCache.keys()) {
    if (k.startsWith(prefix)) homePostsFavoriteCache.delete(k);
  }
}

function normalizeSort(raw: string | null): HomePostsQuerySort {
  if (raw === "popular") return "popular";
  if (parseMarketplaceSort(raw) === "distance") return "distance";
  return "latest";
}

function normalizeType(raw: string | null): HomePostsQueryType {
  if (raw === "trade" || raw === "community" || raw === "service" || raw === "feature") {
    return raw;
  }
  return null;
}

function normalizeTradeState(raw: string | null): HomePostsTradeStateFilter {
  return parseMarketplacePublicTradeState(raw);
}

function normalizePage(raw: string | null): number {
  const page = Number(raw);
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

function buildHomePostsCacheKey(
  page: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  marketSegment: string,
  tradeState: HomePostsTradeStateFilter,
  locSegment: string,
  querySegment = "q::pmin::pmax::ms:newest"
): string {
  return `${page}:${sort}:${type ?? "all"}:m:${marketSegment}:ts:${tradeState}:${locSegment}:${querySegment}`;
}

function buildHomePostsFavoriteCacheKey(
  userId: string,
  page: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  marketSegment: string,
  tradeState: HomePostsTradeStateFilter,
  locSegment: string,
  querySegment = "q::pmin::pmax::ms:newest"
): string {
  return `${userId}:${buildHomePostsCacheKey(page, sort, type, marketSegment, tradeState, locSegment, querySegment)}`;
}

function maybePruneExpiredEntries<T extends { expiresAt: number }>(cache: Map<string, T>): void {
  if (Math.random() < 0.08) {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }
  while (cache.size > 150) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
}

export type HomePostsOpenResult = {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap: Record<string, boolean>;
};

export type ResolveHomePostsGetDataOptions = {
  /**
   * 이미 같은 요청(`req` 쿠키 맥락)에서 `getOptionalAuthenticatedUserId()`로 확정한 뷰어 ID.
   * - 속성을 생략하거나 값이 `undefined`이면 이 함수 안에서 세션을 한 번 조회한다.
   * - `null`(비로그인) 또는 비어 있지 않은 문자열이면 그대로 쓰며 세션을 다시 열지 않는다.
 *   (`GET /api/philife/posts` 가 헤더용 인증과 favorites용 인증을 한 갈래로 맞추기 위함.)
   */
  precomputedViewerUserId?: string | null;
  diagnostics?: ResolveHomePostsServerDiagnostics;
};

export type ResolveHomePostsServerDiagnostics = {
  startedAt: number;
  resolveHomePostsStartMs: number;
  dbQueryStartMs: number;
  dbQueryEndMs: number;
  relatedFetchStartMs: number;
  relatedFetchEndMs: number;
  transformStartMs: number;
  transformEndMs: number;
  serializeStartMs: number;
  serializeEndMs: number;
  responseStartMs: number;
  responseEndMs: number;
};

/**
 * `/market` 기본 진입(latest)용 RSC 시드.
 * 페이지 셸은 `Suspense` fallback 으로 즉시 보내고, 동일 서버 캐시/즐겨찾기 정책으로
 * 첫 리스트를 스트리밍해 클라 hydration 후 네트워크 대기를 줄인다.
 */
export async function resolveDefaultTradeHomePostsSeedForServerComponent(options?: {
  precomputedViewerUserId?: string | null;
}): Promise<HomePostsOpenResult> {
  const clients = await resolvePostsReadClientsForServerComponent();
  if (!clients) {
    return { posts: [], hasMore: false, favoriteMap: {} };
  }
  const { readSb, serviceSb, favoritesSb } = clients;
  const page = 1;
  const sort: HomePostsQuerySort = "latest";
  const type: HomePostsQueryType = null;
  const tradeState: HomePostsTradeStateFilter = "latest";
  const from = 0;

  let tradeCategoryIds: string[] | null = null;
  let effectiveType: HomePostsQueryType = type;
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

  const marketSegment =
    tradeCategoryIds && tradeCategoryIds.length > 0 ? "configured_trade_union" : "all";
  const locSegment = "loc:all";
  const cacheKey = buildHomePostsCacheKey(
    page,
    sort,
    effectiveType,
    marketSegment,
    tradeState,
    locSegment,
    "q::pmin::pmax::ms:newest:si:mix"
  );
  maybePruneExpiredEntries(homePostsServerCache);
  maybePruneExpiredEntries(homePostsFavoriteCache);

  const cachedPosts = homePostsServerCache.get(cacheKey);
  let posts: PostWithMeta[];
  let hasMore: boolean;

  if (cachedPosts && cachedPosts.expiresAt > Date.now()) {
    posts = cachedPosts.posts;
    hasMore = cachedPosts.hasMore;
  } else {
    const loaded = await runSingleFlight(`api:home-posts:${cacheKey}`, async () => {
      const again = homePostsServerCache.get(cacheKey);
      if (again && again.expiresAt > Date.now()) {
        return { posts: again.posts, hasMore: again.hasMore };
      }

      const pack = await resolveHomePostsPayload(
        readSb as SupabaseClient<any>,
        serviceSb as SupabaseClient<any> | null,
        from,
        sort,
        effectiveType,
        tradeCategoryIds,
        resolveHomePostsStatusOrByTradeState(tradeState),
        undefined,
        undefined,
        {
          mixedDiscoverySellIntent: shouldApplyMixedDiscoverySellIntent({
            tradeMarketParent: null,
            type: effectiveType,
          }),
        }
      );
      if (!pack) {
        return null;
      }

      await enrichPostsAuthorNicknamesFromProfiles(readSb as SupabaseClient<any>, pack.posts);
      const promoSb = (serviceSb ?? readSb) as SupabaseClient<any>;
      const projected = await applyTradeHomePromotionProjection(promoSb, {
        pageIndex: tradePromotionPageIndexFromRequestPage(page),
        posts: pack.posts,
        tradeCategoryIds,
      });
      homePostsServerCache.set(cacheKey, {
        posts: projected.posts,
        hasMore: pack.hasMore,
        expiresAt: Date.now() + HOME_POSTS_SERVER_CACHE_TTL_MS,
      });
      return { posts: projected.posts, hasMore: pack.hasMore };
    });

    if (!loaded) {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }

    posts = loaded.posts;
    hasMore = loaded.hasMore;
  }

  const favoriteMap: Record<string, boolean> = {};
  const preViewer = options?.precomputedViewerUserId;
  const userId = preViewer !== undefined ? preViewer : await getOptionalAuthenticatedUserId();

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const favoriteCacheKey = buildHomePostsFavoriteCacheKey(
      userId,
      page,
      sort,
      effectiveType,
      marketSegment,
      tradeState,
      locSegment
    );
    const favEpoch = getPostFavoriteMutationEpochForViewer(userId);
    const cachedFavorites = homePostsFavoriteCache.get(favoriteCacheKey);

    if (
      cachedFavorites &&
      cachedFavorites.expiresAt > Date.now() &&
      cachedFavorites.mutationEpoch === favEpoch
    ) {
      Object.assign(favoriteMap, cachedFavorites.favoriteMap);
    } else {
      const loadFavoritesOnce = async () => {
        const { data: favorites } = await favoritesSb
          .from("favorites")
          .select("post_id")
          .eq("user_id", userId)
          .in("post_id", postIds);
        for (const postId of postIds) {
          favoriteMap[postId] = false;
        }
        for (const row of favorites ?? []) {
          const postId = typeof row.post_id === "string" ? row.post_id : "";
          if (postId) favoriteMap[postId] = true;
        }
      };

      let e0 = getPostFavoriteMutationEpochForViewer(userId);
      await loadFavoritesOnce();
      if (getPostFavoriteMutationEpochForViewer(userId) !== e0) {
        e0 = getPostFavoriteMutationEpochForViewer(userId);
        for (const postId of postIds) {
          delete favoriteMap[postId];
        }
        await loadFavoritesOnce();
      }

      homePostsFavoriteCache.set(favoriteCacheKey, {
        favoriteMap: { ...favoriteMap },
        expiresAt: Date.now() + HOME_POSTS_FAVORITES_CACHE_TTL_MS,
        mutationEpoch: getPostFavoriteMutationEpochForViewer(userId),
      });
    }
  }

  return {
    posts,
    hasMore,
    favoriteMap,
  };
}

/**
 * GET /api/philife/posts 와 동일 페이로드. Supabase 미구성 시 빈 결과.
 */
export async function resolveHomePostsGetData(
  req: NextRequest,
  options?: ResolveHomePostsGetDataOptions
): Promise<HomePostsOpenResult> {
  const diagnostics = options?.diagnostics;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (diagnostics) {
    diagnostics.startedAt = startedAt;
    diagnostics.resolveHomePostsStartMs = 0;
    diagnostics.dbQueryStartMs = 0;
    diagnostics.dbQueryEndMs = 0;
    diagnostics.relatedFetchStartMs = 0;
    diagnostics.relatedFetchEndMs = 0;
    diagnostics.transformStartMs = 0;
    diagnostics.transformEndMs = 0;
    diagnostics.serializeStartMs = 0;
    diagnostics.serializeEndMs = 0;
    diagnostics.responseStartMs = 0;
    diagnostics.responseEndMs = 0;
  }
  const elapsedMs = () =>
    Math.max(
      0,
      Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt)
    );
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return { posts: [], hasMore: false, favoriteMap: {} };
  }
  const { readSb, serviceSb, favoritesSb } = clients;

  const { searchParams } = new URL(req.url);
  const page = normalizePage(searchParams.get("page"));
  const sort = normalizeSort(searchParams.get("sort"));
  const type = normalizeType(searchParams.get("type"));
  const tradeState = normalizeTradeState(searchParams.get("tradeState"));
  const statusOr = resolveHomePostsStatusOrByTradeState(tradeState);
  const locationScope = parseTradeLocationScopeFromSearchParams(searchParams);
  const lguCityId =
    locationScope.mode === "city"
      ? locationScope.lguId
      : locationScope.mode === "invalid"
        ? locationScope.raw || "invalid"
        : undefined;
  const radiusKm = locationScope.mode === "city" ? locationScope.radiusKm : undefined;
  const locSegment =
    locationScope.mode === "city"
      ? `loc:lgu:${locationScope.canonicalId}:${tradeBrowseRadiusCacheSegment(locationScope.radiusKm)}`
      : locationScope.mode === "invalid"
        ? `loc:invalid:${locationScope.raw || "_"}`
        : locationScope.mode === "unset"
          ? "loc:unset"
          : "loc:all";
  const q = sanitizeMarketplaceQueryText(searchParams.get("q"));
  const priceMin = parseMarketplacePriceBound(searchParams.get("priceMin"));
  const priceMax = parseMarketplacePriceBound(searchParams.get("priceMax"));
  const rawTradeMarketParentTokens = (() => {
    const multi = searchParams.get("tradeMarketParentIds");
    if (multi && multi.trim()) {
      return multi
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    const single = searchParams.get("tradeMarketParent");
    return single && single.trim() ? [single] : [];
  })();

  const resolvedTradeMarketParentIds = rawTradeMarketParentTokens.length
    ? (await Promise.all(
        rawTradeMarketParentTokens.map((tok) =>
          resolveTradeMarketParentParam(readSb as SupabaseClient<any>, tok)
        )
      )).filter((x): x is string => Boolean(x))
    : [];

  // `resolveCompositionFilterQueryFromRequest` / mixed-discovery sell-intent은 "primary root" 1개만으로 유지
  const tradeMarketParent = resolvedTradeMarketParentIds[0] ?? null;

  const compositionQuery = await resolveCompositionFilterQueryFromRequest(
    readSb as SupabaseClient<any>,
    tradeMarketParent,
    searchParams
  );
  const compositionFilters = compositionQuery.clauses;
  const mixedDiscoverySellIntent = shouldApplyMixedDiscoverySellIntent({
    tradeMarketParent,
    type,
  });
  const querySegmentBase = marketplaceQueryCacheSegment({
    q,
    priceMin,
    priceMax,
    sort,
  });
  const cfSegment =
    Object.keys(compositionQuery.selection).length > 0
      ? `:${compositionFilterCacheSegment(compositionQuery.selection)}`
      : "";
  const querySegment = `${querySegmentBase}${cfSegment}${mixedDiscoverySellIntent ? ":si:mix" : ""}`;

  const topicPairsRaw = (searchParams.get("tradeTopicByParent") ?? "").trim();
  const tradeTopicByParent: Record<string, string> = {};
  if (topicPairsRaw) {
    for (const part of topicPairsRaw.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const idx = p.indexOf(":");
      if (idx <= 0) continue;
      const rootKey = p.slice(0, idx).trim();
      const topicKey = p.slice(idx + 1).trim();
      if (!rootKey || !topicKey) continue;
      tradeTopicByParent[rootKey] = topicKey;
    }
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function resolveTradeTopicCategoryId(rootId: string, topicKey: string): Promise<string | null> {
    const t = topicKey.trim().normalize("NFC");
    if (!t) return null;
    if (UUID_RE.test(t)) return t;
    const qsb = (serviceSb ?? readSb) as SupabaseClient<any>;
    const { data, error } = await qsb
      .from("categories")
      .select("id")
      .eq("type", "trade")
      .eq("parent_id", rootId)
      .eq("is_active", true)
      .eq("slug", t)
      .limit(1)
      .maybeSingle();
    if (error || !data || typeof data !== "object") return null;
    const id = (data as { id?: unknown }).id;
    if (!id) return null;
    return String(id);
  }

  const hasRootSelection = resolvedTradeMarketParentIds.length > 0;
  let categoryPriorityRootTradeCategoryIds: string[] | null = null;
  let categoryPriorityTopicTradeCategoryIds: string[] | null = null;

  let tradeCategoryIds: string[] | null = null; // promotion projection uses this (selected roots union)
  let tradeCategoryIdsForQuery: string[] | null = null; // M-HARD membership IN gate (CUT-SSOT-1)
  let effectiveType: HomePostsQueryType = type;

  if (hasRootSelection) {
    // root union
    const rootSets = await Promise.all(
      resolvedTradeMarketParentIds.map((pid) =>
        expandTradeMarketCategoryFilterIds(
          readSb as SupabaseClient<any>,
          serviceSb as SupabaseClient<any> | null,
          pid
        )
      )
    );
    const rootUnion = new Set<string>();
    for (const set of rootSets) {
      for (const id of set) rootUnion.add(id);
    }
    categoryPriorityRootTradeCategoryIds = [...rootUnion];
    tradeCategoryIds = categoryPriorityRootTradeCategoryIds;

    // topic union (optional per root)
    const topicPairs = Object.entries(tradeTopicByParent);
    if (topicPairs.length > 0) {
      const resolvedTopicCategoryIds = await Promise.all(
        topicPairs.map(async ([rootId, topicKey]) => {
          if (!resolvedTradeMarketParentIds.includes(rootId)) return null;
          return resolveTradeTopicCategoryId(rootId, topicKey);
        })
      );
      const resolvedTopicIds = resolvedTopicCategoryIds.filter((x): x is string => Boolean(x));
      if (resolvedTopicIds.length > 0) {
        const topicSets = await Promise.all(
          resolvedTopicIds.map((tid) =>
            expandTradeMarketCategoryFilterIds(
              readSb as SupabaseClient<any>,
              serviceSb as SupabaseClient<any> | null,
              tid
            )
          )
        );
        const topicUnion = new Set<string>();
        for (const set of topicSets) {
          for (const id of set) topicUnion.add(id);
        }
        categoryPriorityTopicTradeCategoryIds = [...topicUnion];
      }
    }

    // CUT-SSOT-1 M-HARD: `computeMarketFilterIds` parity with trade/feed
    const qsb =
      tryCreateSupabaseServiceClient() ?? (serviceSb as SupabaseClient<any>) ?? (readSb as SupabaseClient<any>);
    tradeCategoryIdsForQuery = await resolveMarketplaceMembershipIdsForRoots(
      qsb,
      resolvedTradeMarketParentIds.map((pid) => ({
        parentId: pid,
        topicParam: tradeTopicByParent[pid] ?? "",
      }))
    );
    if (tradeCategoryIdsForQuery) {
      tradeCategoryIds = tradeCategoryIdsForQuery;
    }

    // marketplaces in this route should stay `trade`-only even without hard category ids
    if (type == null || type === "trade") effectiveType = "trade";
  } else if (isConfiguredTradeUnionEnabledForHomeAll() && (type == null || type === "trade")) {
    const union = await expandTradeCategoryIdsForAllConfiguredHomeRoots(
      readSb as SupabaseClient<any>,
      serviceSb as SupabaseClient<any> | null
    );
    if (union.length > 0) {
      tradeCategoryIds = union;
      categoryPriorityRootTradeCategoryIds = null;
      categoryPriorityTopicTradeCategoryIds = null;
      tradeCategoryIdsForQuery = union;
      effectiveType = "trade";
    }
  }

  const marketSegment = (() => {
    if (hasRootSelection) {
      const rootsKey = [...resolvedTradeMarketParentIds].sort().join(",");
      const pairs: string[] = [];
      for (const [rid, topicKey] of Object.entries(tradeTopicByParent)) {
        if (!resolvedTradeMarketParentIds.includes(rid)) continue;
        const t = topicKey?.trim();
        if (!t) continue;
        pairs.push(`${rid}:${t}`);
      }
      pairs.sort();
      const topicsKey = pairs.length > 0 ? `:t:${pairs.join(",")}` : "";
      return `configured_roots:${rootsKey}${topicsKey}`;
    }
    return tradeMarketParent
      ? tradeMarketParent
      : tradeCategoryIds && tradeCategoryIds.length > 0
        ? "configured_trade_union"
        : "all";
  })();
  const from = (page - 1) * HOME_POSTS_PAGE_SIZE;
  const useSearchExpansion = shouldApplyMarketplaceSearchExpansion({ q, sort });
  let searchTopicGraphContext = null;
  if (useSearchExpansion && q) {
    const qsb =
      tryCreateSupabaseServiceClient() ?? (serviceSb as SupabaseClient<any>) ?? (readSb as SupabaseClient<any>);
    searchTopicGraphContext = await loadSearchTopicGraphContext(
      qsb,
      q,
      resolvedTradeMarketParentIds.length > 0 ? resolvedTradeMarketParentIds : null
    );
  }
  const rankedWindowKey = buildSearchRankedWindowCacheKey({
    sort,
    type: effectiveType ?? "all",
    marketSegment,
    tradeState,
    locSegment,
    querySegment,
  });
  const cacheKey = buildHomePostsCacheKey(
    page,
    sort,
    effectiveType,
    marketSegment,
    tradeState,
    locSegment,
    querySegment
  );
  maybePruneExpiredEntries(homePostsServerCache);
  maybePruneExpiredEntries(homePostsFavoriteCache);

  const freshFeed = isDibayMarketFreshFeedRequest(req.headers);
  if (freshFeed) {
    invalidateSearchRankedWindowSession(rankedWindowKey);
    homePostsServerCache.delete(cacheKey);
  }

  const cachedPosts = freshFeed ? undefined : homePostsServerCache.get(cacheKey);
  let posts: PostWithMeta[];
  let hasMore: boolean;

  if (cachedPosts && cachedPosts.expiresAt > Date.now()) {
    posts = cachedPosts.posts;
    hasMore = cachedPosts.hasMore;
  } else {
    const loaded = await runSingleFlight(`api:home-posts:${cacheKey}`, async () => {
      const again = homePostsServerCache.get(cacheKey);
      if (again && again.expiresAt > Date.now() && !freshFeed) {
        return { posts: again.posts, hasMore: again.hasMore };
      }

      if (diagnostics) diagnostics.dbQueryStartMs = elapsedMs();
      const pack = useSearchExpansion
        ? await takeSearchRankedWindowPage({
            key: rankedWindowKey,
            page,
            pageSize: HOME_POSTS_PAGE_SIZE,
            loadNext: async (cursor) => {
              const round = await resolveSearchExpansionRound(
                readSb as SupabaseClient<any>,
                serviceSb as SupabaseClient<any> | null,
                sort,
                effectiveType,
                tradeCategoryIdsForQuery,
                statusOr,
                lguCityId,
                radiusKm,
                {
                  q,
                  priceMin,
                  priceMax,
                  compositionFilters,
                  mixedDiscoverySellIntent,
                  categoryPriorityRootTradeCategoryIds,
                  categoryPriorityTopicTradeCategoryIds,
                  searchTopicGraphContext,
                },
                cursor
              );
              if (!round) return null;
              await enrichPostsAuthorNicknamesFromProfiles(
                readSb as SupabaseClient<any>,
                round.posts
              );
              return round;
            },
          })
        : await resolveHomePostsPayload(
            readSb as SupabaseClient<any>,
            serviceSb as SupabaseClient<any> | null,
            from,
            sort,
            effectiveType,
            tradeCategoryIdsForQuery,
            statusOr,
            lguCityId,
            radiusKm,
            {
              q,
              priceMin,
              priceMax,
              compositionFilters,
              mixedDiscoverySellIntent,
              categoryPriorityRootTradeCategoryIds,
              categoryPriorityTopicTradeCategoryIds,
            }
          );
      if (diagnostics) diagnostics.dbQueryEndMs = elapsedMs();
      if (!pack) {
        return null;
      }

      /** 캐시에 넣기 전 닉네임 보강 — TTL 동안 요청마다 `profiles` 재조회하지 않음 */
      if (diagnostics && diagnostics.relatedFetchStartMs === 0) diagnostics.relatedFetchStartMs = elapsedMs();
      if (!useSearchExpansion) {
        await enrichPostsAuthorNicknamesFromProfiles(readSb as SupabaseClient<any>, pack.posts);
      }
      if (diagnostics) diagnostics.relatedFetchEndMs = elapsedMs();

      const promoSb = (serviceSb ?? readSb) as SupabaseClient<any>;
      // CUT F: SEARCH q → overlay badge only. Empty q = LIST/CATEGORY pin.
      const projected = await applyTradeHomePromotionProjection(promoSb, {
        pageIndex: tradePromotionPageIndexFromRequestPage(page),
        posts: pack.posts,
        tradeCategoryIds,
        pinPromoted: !q,
      });

      homePostsServerCache.set(cacheKey, {
        posts: projected.posts,
        hasMore: pack.hasMore,
        expiresAt: Date.now() + HOME_POSTS_SERVER_CACHE_TTL_MS,
      });
      return { posts: projected.posts, hasMore: pack.hasMore };
    });

    if (!loaded) {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }

    posts = loaded.posts;
    hasMore = loaded.hasMore;
  }
  const favoriteMap: Record<string, boolean> = {};
  const preViewer = options?.precomputedViewerUserId;
  const userId =
    preViewer !== undefined ? preViewer : await getOptionalAuthenticatedUserId();

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const favoriteCacheKey = buildHomePostsFavoriteCacheKey(
      userId,
      page,
      sort,
      effectiveType,
      marketSegment,
      tradeState,
      locSegment,
      querySegment
    );
    const favEpoch = getPostFavoriteMutationEpochForViewer(userId);
    const cachedFavorites = homePostsFavoriteCache.get(favoriteCacheKey);

    if (
      cachedFavorites &&
      cachedFavorites.expiresAt > Date.now() &&
      cachedFavorites.mutationEpoch === favEpoch
    ) {
      Object.assign(favoriteMap, cachedFavorites.favoriteMap);
    } else {
      const loadFavoritesOnce = async () => {
        if (diagnostics && diagnostics.relatedFetchStartMs === 0) diagnostics.relatedFetchStartMs = elapsedMs();
        const { data: favorites } = await favoritesSb
          .from("favorites")
          .select("post_id")
          .eq("user_id", userId)
          .in("post_id", postIds);
        if (diagnostics) diagnostics.relatedFetchEndMs = elapsedMs();
        for (const postId of postIds) {
          favoriteMap[postId] = false;
        }
        for (const row of favorites ?? []) {
          const postId = typeof row.post_id === "string" ? row.post_id : "";
          if (postId) favoriteMap[postId] = true;
        }
      };

      let e0 = getPostFavoriteMutationEpochForViewer(userId);
      await loadFavoritesOnce();
      if (getPostFavoriteMutationEpochForViewer(userId) !== e0) {
        e0 = getPostFavoriteMutationEpochForViewer(userId);
        for (const postId of postIds) {
          delete favoriteMap[postId];
        }
        await loadFavoritesOnce();
      }

      homePostsFavoriteCache.set(favoriteCacheKey, {
        favoriteMap: { ...favoriteMap },
        expiresAt: Date.now() + HOME_POSTS_FAVORITES_CACHE_TTL_MS,
        mutationEpoch: getPostFavoriteMutationEpochForViewer(userId),
      });
    }
  }

  if (diagnostics) diagnostics.transformStartMs = elapsedMs();
  const result = {
    posts,
    hasMore,
    favoriteMap,
  };
  if (diagnostics) diagnostics.transformEndMs = elapsedMs();
  return result;
}
