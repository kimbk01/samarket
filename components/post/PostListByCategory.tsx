"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getPostsByTradeCategoryIds,
  primeTradeFeedCache,
  readFreshTradeFeedClientCache,
  type GetPostsByCategoryOptions,
  type PostSort,
} from "@/lib/posts/getPostsByCategory";
import { TRADE_POST_LIST_CACHE_INVALIDATED, invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { getFavoriteStatusForPosts } from "@/lib/favorites/getFavoriteStatusForPosts";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { PostCard } from "./PostCard";
import { HiddenPostCard } from "./HiddenPostCard";
import { NotInterestedCard } from "./NotInterestedCard";
import type { PostListMenuAction } from "./PostListMenuBottomSheet";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";
import { rememberTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const ReportReasonModal = dynamic(
  () => import("./ReportReasonModal").then((m) => m.ReportReasonModal),
  { loading: () => null }
);
import { computeTradeFeedKey, computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import { tradeMarketPath } from "@/lib/categories/tradeMarketPath";
import { TRADE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { recordTradeListMetric } from "@/lib/runtime/trade-list-entry-debug";
import { capRecordByOldestTimestamps } from "@/lib/http/memory-map-prune";
import { TradeFeedBufferingSpinner } from "@/components/trade/TradeFeedBufferingSpinner";
import { TradeListLoadMoreFooter } from "@/components/trade/TradeListLoadMoreFooter";
import { awaitTradeListLoadMoreMinDelay } from "@/lib/trade/trade-list-load-more-delay";
import { TradeMarketPullRefreshRegister } from "@/components/trade/TradeMarketPullRefreshRegister";
import { resolveTradeMarketPullRefreshRouteKey } from "@/lib/trade/trade-market-pull-refresh-surface";
import { Fragment } from "react";
import { FeedAdBannerCarousel } from "@/components/ads/FeedAdBannerCarousel";
import {
  feedAdSlotSeed,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
} from "@/lib/ads/feed-ad-slot-policy";
import { getOrCreateFeedAdSessionId } from "@/lib/ads/feed-ad-session";

const ROUTE_PREFETCH_TS_MAX_KEYS = 120;

interface PostListByCategoryProps {
  categoryId: string;
  /** 스킨 적용용 (일반/부동산/중고차/알바/환전) */
  category?: CategoryWithSettings | null;
  sort?: PostSort;
  /** 상위+주제 OR 조회 시 id 목록. `tradeFeedServerResolution` 이면 무시 */
  filterCategoryIds?: string[];
  /**
   * true: `/api/trade/feed?tradeMarketParent=` 로 서버에서 카테고리 트리 펼침 — 홈·마켓·bootstrap 단일 소스
   */
  tradeFeedServerResolution?: boolean;
  /** `tradeFeedServerResolution` 일 때 `?topic=` (주제 칩) */
  tradeTopicParam?: string;
  /** 알바 마켓: 구인/구직 메타 필터 */
  jobsListingKind?: JobListingKindFilter;
  /** 알바: 근무 형태 DB 필터 (`je=`) */
  jobEmploymentType?: string;
  /** 알바: 오늘 근무 가능 */
  todayAvailable?: boolean;
  /** 일자리 마켓 `jr`/`jc` */
  jobRegionSlug?: string;
  jobIndustrySlug?: string;
  /** 마켓 bootstrap 첫 페이지 — `feedKey`가 현재 필터와 같을 때만 적용 */
  initialTradeFeed?: {
    posts: PostWithMeta[];
    hasMore: boolean;
    feedKey: string;
    favoriteMap?: Record<string, boolean>;
  } | null;
}

export function PostListByCategory({
  categoryId,
  category,
  sort = "latest",
  filterCategoryIds,
  tradeFeedServerResolution = false,
  tradeTopicParam = "",
  jobsListingKind,
  jobEmploymentType,
  todayAvailable = false,
  jobRegionSlug,
  jobIndustrySlug,
  initialTradeFeed = null,
}: PostListByCategoryProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tradeStateRaw = searchParams.get("tradeState")?.trim() ?? "";
  const tradeState: "latest" | "active" | "reserved" | "sold" =
    tradeStateRaw === "active" || tradeStateRaw === "reserved" || tradeStateRaw === "sold"
      ? tradeStateRaw
      : "latest";
  const locationScope = useMemo(
    () => parseTradeLocationScopeFromSearchParams(searchParams),
    [searchParams]
  );
  const locationInvalid = locationScope.mode === "invalid";
  const lguCityId =
    locationScope.mode === "city"
      ? locationScope.lguId
      : locationInvalid
        ? locationScope.raw || "invalid"
        : undefined;
  const effectiveIds = useMemo(() => {
    if (tradeFeedServerResolution) return [categoryId];
    if (filterCategoryIds && filterCategoryIds.length > 0) return filterCategoryIds;
    return [categoryId];
  }, [categoryId, filterCategoryIds, tradeFeedServerResolution]);

  const feedExtras = useMemo(
    () => ({
      jobEmploymentType: jobEmploymentType?.trim() || undefined,
      todayAvailable: todayAvailable === true,
      jobRegionSlug: jobRegionSlug?.trim() || undefined,
      jobIndustrySlug: jobIndustrySlug?.trim() || undefined,
      tradeState,
      lguCityId,
    }),
    [jobEmploymentType, todayAvailable, jobRegionSlug, jobIndustrySlug, tradeState, lguCityId]
  );

  /**
   * `getPostsByTradeCategoryIds` · `readFreshTradeFeedClientCache` · `primeTradeFeedCache` 가 동일 키를 쓰도록
   * 옵션을 한 곳에서 조립한다. (마켓 부모 + 일반 탭: `topic:""`·`jk` 생략 — 기존 분기와 동일)
   */
  const buildTradeFeedRequestOptions = useCallback(
    (pageNum: number): GetPostsByCategoryOptions => {
      const page = Math.max(1, pageNum);
      const extras = {
        jobEmploymentType: feedExtras.jobEmploymentType,
        todayAvailable: feedExtras.todayAvailable,
        jobRegionSlug: feedExtras.jobRegionSlug,
        jobIndustrySlug: feedExtras.jobIndustrySlug,
        tradeState: feedExtras.tradeState,
        lguCityId: feedExtras.lguCityId,
      };
      if (!tradeFeedServerResolution) {
        return { page, sort, jobsListingKind, ...extras };
      }
      const useUnfilteredMarketParentFeed =
        jobsListingKind !== "hire" && jobsListingKind !== "work" && !tradeTopicParam.trim();
      if (useUnfilteredMarketParentFeed) {
        return {
          page,
          sort,
          tradeMarketParent: categoryId,
          topic: "",
          ...extras,
        };
      }
      return {
        page,
        sort,
        jobsListingKind,
        tradeMarketParent: categoryId,
        topic: tradeTopicParam,
        ...extras,
      };
    },
    [
      tradeFeedServerResolution,
      categoryId,
      sort,
      jobsListingKind,
      tradeTopicParam,
      feedExtras,
    ]
  );

  const feedKey = useMemo(
    () =>
      tradeFeedServerResolution
        ? computeTradeFeedKeyForMarketParent(
            categoryId,
            tradeTopicParam,
            sort,
            jobsListingKind,
            feedExtras
          )
        : computeTradeFeedKey(effectiveIds, sort, jobsListingKind, feedExtras),
    [
      tradeFeedServerResolution,
      categoryId,
      tradeTopicParam,
      effectiveIds,
      sort,
      jobsListingKind,
      feedExtras,
    ]
  );

  const initialCachedFeed = useMemo(() => {
    if (!categoryId) return null;
    const ids = tradeFeedServerResolution ? [] : effectiveIds;
    return readFreshTradeFeedClientCache(ids, buildTradeFeedRequestOptions(1));
  }, [categoryId, tradeFeedServerResolution, effectiveIds, buildTradeFeedRequestOptions]);

  /**
   * CONTRACT (C): mount seed — client cache OR matching `initialTradeFeed` only.
   * feedKey mismatch / other category bootstrap must not seed (stale flash 금지).
   */
  const mountSeedFeed =
    initialCachedFeed ??
    (initialTradeFeed && initialTradeFeed.feedKey === feedKey
      ? {
          posts: initialTradeFeed.posts,
          hasMore: initialTradeFeed.hasMore,
          favoriteMap: initialTradeFeed.favoriteMap,
        }
      : null);

  const [posts, setPosts] = useState<PostWithMeta[]>(() => mountSeedFeed?.posts ?? []);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(
    () => mountSeedFeed?.favoriteMap ?? {}
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !mountSeedFeed);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => mountSeedFeed?.hasMore === true);
  const [page, setPage] = useState(1);
  /** `feedKey` 변경 시 늦게 도착한 목록 응답이 상태를 덮어쓰지 않게 함 (`docs/trade-market-feed-contract.md`) */
  const listFeedEpochRef = useRef(0);
  /** 글 등록 직후 RSC bootstrap 이 클라 fetch 보다 느리면 stale 로 덮는 것 방지 */
  const allowRscBootstrapFeedRef = useRef(true);
  /**
   * Mount/effect 가 이미 이 feedKey 목록을 시드·적용했으면 setPosts 중복 전이 생략
   * (cache / matching bootstrap only).
   */
  const appliedListFeedKeyRef = useRef<string | null>(mountSeedFeed ? feedKey : null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRootRef = useRef<HTMLUListElement | null>(null);
  const firstCardPaintStartRef = useRef(0);
  const firstCardPaintFeedKeyRef = useRef("");
  const routePrefetchAtRef = useRef<Record<string, number>>({});
  const favoriteFetchEpochRef = useRef(0);
  /** 의존성에 객체 참조를 넣지 않아 부모 리렌더만으로 피드 epoch·네트워크 중복 방지 */
  const initialTradeFeedRef = useRef(initialTradeFeed);
  initialTradeFeedRef.current = initialTradeFeed;

  const resolveFavoriteMapAsync = useCallback(
    (targetPosts: PostWithMeta[], pageNum: number, epoch: number) => {
      if (targetPosts.length === 0) {
        if (pageNum === 1 && epoch === listFeedEpochRef.current) {
          setFavoriteMap({});
        }
        return;
      }
      const jobEpoch = ++favoriteFetchEpochRef.current;
      void (async () => {
        const map = await getFavoriteStatusForPosts(targetPosts.map((p) => p.id));
        if (jobEpoch !== favoriteFetchEpochRef.current) return;
        if (epoch !== listFeedEpochRef.current) return;
        if (pageNum === 1) {
          setFavoriteMap(map);
        } else {
          setFavoriteMap((prev) => ({ ...prev, ...map }));
        }
      })();
    },
    []
  );

  const load = useCallback(
    async (pageNum: number = 1, opts?: { append?: boolean }) => {
      if (!categoryId) {
        setLoading((prev) => (prev ? false : prev));
        allowRscBootstrapFeedRef.current = true;
        return;
      }
      if (!tradeFeedServerResolution && effectiveIds.length === 0) {
        setLoading((prev) => (prev ? false : prev));
        allowRscBootstrapFeedRef.current = true;
        return;
      }
      const append = opts?.append === true && pageNum > 1;
      const epochAtStart = listFeedEpochRef.current;
      if (!append) {
        setLoading((prev) => (prev ? prev : true));
      }
      try {
        const ids = tradeFeedServerResolution ? [] : effectiveIds;
        const next = await getPostsByTradeCategoryIds(ids, buildTradeFeedRequestOptions(pageNum));
        if (epochAtStart !== listFeedEpochRef.current) return;
        if (pageNum === 1) {
          setPosts(next.posts);
          setHiddenPostIds(new Set());
          setNotInterestedPostIds(new Set());
        } else {
          setPosts((prev) => [...prev, ...next.posts]);
        }
        setHasMore(next.hasMore);
        if (next.favoriteMap !== undefined) {
          if (pageNum === 1) {
            setFavoriteMap(next.favoriteMap);
          } else {
            setFavoriteMap((prev) => ({ ...prev, ...next.favoriteMap }));
          }
        } else {
          resolveFavoriteMapAsync(next.posts, pageNum, epochAtStart);
        }
      } finally {
        if (epochAtStart === listFeedEpochRef.current && !append) {
          setLoading(false);
        }
        allowRscBootstrapFeedRef.current = true;
      }
    },
    [
      categoryId,
      effectiveIds,
      tradeFeedServerResolution,
      resolveFavoriteMapAsync,
      buildTradeFeedRequestOptions,
    ]
  );

  const postsRef = useRef(posts);
  postsRef.current = posts;

  const pullRefreshRouteKey = useMemo(() => {
    const marketSurfacePath = category ? tradeMarketPath(category) : pathname;
    return resolveTradeMarketPullRefreshRouteKey(marketSurfacePath, searchParams);
  }, [category, pathname, searchParams]);

  useEffect(() => {
    const q = searchParams.toString();
    rememberTradeListReturnHref(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams]);

  const onPullRefresh = useCallback(async () => {
    invalidateHomePostsCache({ notifyListReload: false });
    allowRscBootstrapFeedRef.current = false;
    listFeedEpochRef.current += 1;
    favoriteFetchEpochRef.current += 1;
    setPage(1);
    await load(1);
  }, [load]);

  const tradePullRefreshRegister =
    pullRefreshRouteKey != null ? (
      <TradeMarketPullRefreshRegister routeKey={pullRefreshRouteKey} onRefresh={onPullRefresh} />
    ) : null;

  /**
   * 마켓 카테고리 리스트→상세: 상단 10건 `/post/:id` prefetch (제거·약화 시 회귀).
   * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
   */
  const routePrefetchTopIdsKey = useMemo(
    () =>
      posts
        .slice(0, 10)
        .map((p) => String(p.id ?? "").trim())
        .filter(Boolean)
        .join("|"),
    [posts]
  );

  useEffect(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const row = postsRef.current;
    if (row.length === 0) return;
    const now = Date.now();
    for (const post of row.slice(0, 10)) {
      const postId = (post.id ?? "").trim();
      if (!postId) continue;
      const href = `/post/${encodeURIComponent(postId)}`;
      const last = routePrefetchAtRef.current[href] ?? 0;
      if (now - last < 15_000) continue;
      routePrefetchAtRef.current[href] = now;
      capRecordByOldestTimestamps(routePrefetchAtRef.current, ROUTE_PREFETCH_TS_MAX_KEYS);
      void router.prefetch(href);
    }
  }, [routePrefetchTopIdsKey, router]);

  useLayoutEffect(() => {
    let cancelled = false;
    listFeedEpochRef.current += 1;
    const epoch = listFeedEpochRef.current;
    setPage(1);

    const applyBootstrapOrCacheSync = (): boolean => {
      if (cancelled || epoch !== listFeedEpochRef.current) return true;

      const bootstrap = initialTradeFeedRef.current;
      if (allowRscBootstrapFeedRef.current && bootstrap && bootstrap.feedKey === feedKey) {
        const ids = tradeFeedServerResolution ? [] : effectiveIds;
        primeTradeFeedCache(ids, buildTradeFeedRequestOptions(1), {
          posts: bootstrap.posts,
          hasMore: bootstrap.hasMore,
          ...(bootstrap.favoriteMap !== undefined ? { favoriteMap: bootstrap.favoriteMap } : {}),
        });
        const alreadyApplied = appliedListFeedKeyRef.current === feedKey;
        if (!alreadyApplied) {
          setPosts(bootstrap.posts);
          setHasMore(bootstrap.hasMore);
          setHiddenPostIds(new Set());
          setNotInterestedPostIds(new Set());
          setFavoriteMap(bootstrap.favoriteMap ?? {});
          setLoading(false);
          appliedListFeedKeyRef.current = feedKey;
        }
        if (bootstrap.favoriteMap === undefined) {
          resolveFavoriteMapAsync(bootstrap.posts, 1, epoch);
        }
        return true;
      }

      const peekIds = tradeFeedServerResolution ? [] : effectiveIds;
      const cached = readFreshTradeFeedClientCache(peekIds, buildTradeFeedRequestOptions(1));
      if (cached) {
        const alreadyApplied = appliedListFeedKeyRef.current === feedKey;
        if (!alreadyApplied) {
          setPosts(cached.posts);
          setHasMore(cached.hasMore);
          setHiddenPostIds(new Set());
          setNotInterestedPostIds(new Set());
          setFavoriteMap(cached.favoriteMap ?? {});
          setLoading(false);
          appliedListFeedKeyRef.current = feedKey;
        }
        return true;
      }

      return false;
    };

    if (applyBootstrapOrCacheSync()) {
      return () => {
        cancelled = true;
      };
    }

    appliedListFeedKeyRef.current = null;
    setLoading(true);
    setPosts([]);
    setHasMore(false);
    setHiddenPostIds(new Set());
    setNotInterestedPostIds(new Set());
    setFavoriteMap({});

    queueMicrotask(() => {
      if (cancelled || epoch !== listFeedEpochRef.current) return;
      void load(1);
    });

    return () => {
      cancelled = true;
    };
  }, [
    feedKey,
    initialTradeFeed?.feedKey,
    load,
    resolveFavoriteMapAsync,
    buildTradeFeedRequestOptions,
    tradeFeedServerResolution,
    effectiveIds,
    categoryId,
  ]);

  /** 글쓰기 완료 등 — 캐시 무효화 후 동일 피드에 머물러도 네트워크로 최신 목록 */
  useEffect(() => {
    const onBust = () => {
      allowRscBootstrapFeedRef.current = false;
      listFeedEpochRef.current += 1;
      favoriteFetchEpochRef.current += 1;
      void load(1);
    };
    window.addEventListener(TRADE_POST_LIST_CACHE_INVALIDATED, onBust);
    return () => window.removeEventListener(TRADE_POST_LIST_CACHE_INVALIDATED, onBust);
  }, [load]);

  useLayoutEffect(() => {
    firstCardPaintFeedKeyRef.current = feedKey;
    firstCardPaintStartRef.current = performance.now();
  }, [feedKey]);

  useEffect(() => {
    if (loading || posts.length === 0) return;
    if (firstCardPaintFeedKeyRef.current !== feedKey) return;
    const root = listRootRef.current;
    if (!root) return;
    const firstCard = root.querySelector('a[href^="/post/"], article, li');
    if (!firstCard) return;
    const startedAt = firstCardPaintStartRef.current;
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    queueMicrotask(() => {
      if (typeof requestAnimationFrame !== "function") return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          recordTradeListMetric("trade_list_swipe_first_card_paint_ms", performance.now() - startedAt);
          firstCardPaintStartRef.current = 0;
        });
      });
    });
  }, [feedKey, loading, posts.length]);

  useEffect(() => {
    const onFav = (e: Event) => {
      const d = (e as CustomEvent<{ postId?: string; isFavorite?: boolean }>).detail;
      if (!d?.postId || typeof d.isFavorite !== "boolean") return;
      const postId = d.postId;
      const fav = d.isFavorite;
      setFavoriteMap((prev) => {
        const next: Record<string, boolean> = { ...prev };
        next[postId] = fav;
        return next;
      });
    };
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    const startedAt = Date.now();
    try {
      await load(next, { append: true });
    } finally {
      await awaitTradeListLoadMoreMinDelay(startedAt);
      setLoadingMore(false);
    }
  }, [hasMore, load, loading, loadingMore, page]);

  const handleFavoriteChange = useCallback((postId: string, isFavorite: boolean) => {
    setFavoriteMap((prev) => ({ ...prev, [postId]: isFavorite }));
  }, []);

  const handleMenuAction = useCallback((postId: string, action: PostListMenuAction) => {
    if (action === "interest") {
      setToast("관심 있음으로 표시했어요");
      if (toastTimerRef.current != null) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        toastTimerRef.current = null;
        setToast((prev) => (prev === null ? prev : null));
      }, 2000);
    }
    if (action === "not_interest") {
      setNotInterestedPostIds((prev) => new Set(prev).add(postId));
    }
    if (action === "hide") {
      setHiddenPostIds((prev) => new Set(prev).add(postId));
    }
    if (action === "report") {
      setReportPostId(postId);
    }
    if (action === "delete_own") {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setFavoriteMap((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    }
  }, []);

  const handleUndoNotInterested = useCallback((postId: string) => {
    setNotInterestedPostIds((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });
  }, []);

  const handleUndoHide = useCallback((postId: string) => {
    setHiddenPostIds((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });
  }, []);

  /** Feed Banner — always call (HomeProductList parity). Do not place below early returns. */
  const tradeCategorySurfaceKey = `trade:category:${categoryId}`;
  const tradeCategoryAdSessionId = useMemo(
    () => getOrCreateFeedAdSessionId(tradeCategorySurfaceKey),
    [tradeCategorySurfaceKey]
  );
  const tradeCategoryAdPlan = useMemo(
    () =>
      planFeedAdSlots(
        posts.length,
        feedAdSlotSeed({
          surfaceKey: tradeCategorySurfaceKey,
          feedSessionId: tradeCategoryAdSessionId,
        })
      ),
    [posts.length, tradeCategorySurfaceKey, tradeCategoryAdSessionId]
  );
  const skinKey = category?.icon_key ?? undefined;

  // JSX 분기 return — hooks must stay above this marker (verify:post-list-by-category-hooks-contract)
  if (locationInvalid) {
    return (
      <>
        {tradePullRefreshRegister}
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-[14px] text-sam-muted">{t("trade_location_invalid")}</p>
          <button
            type="button"
            className="text-[14px] font-medium text-signature"
            onClick={() => {
              router.replace(
                buildTradeLocationHref(pathname, searchParams.toString(), { mode: "all" }),
                { scroll: false }
              );
            }}
          >
            {t("trade_location_view_all")}
          </button>
        </div>
      </>
    );
  }

  if (loading && posts.length === 0) {
    return (
      <>
        {tradePullRefreshRegister}
        <div className="flex min-h-[min(36vh,320px)] items-center justify-center py-8" aria-busy="true">
          <TradeFeedBufferingSpinner />
        </div>
      </>
    );
  }

  if (posts.length === 0) {
    const cityLabel =
      locationScope.mode === "city"
        ? peekTradeLguDisplayLabel(locationScope.canonicalId)
        : null;
    if (cityLabel) {
      return (
        <>
          {tradePullRefreshRegister}
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-[14px] text-sam-muted">
              {t("trade_location_empty", { city: cityLabel })}
            </p>
            <button
              type="button"
              className="text-[14px] font-medium text-signature"
              onClick={() => {
                router.replace(
                  buildTradeLocationHref(pathname, searchParams.toString(), { mode: "all" }),
                  { scroll: false }
                );
              }}
            >
              {t("trade_location_view_all")}
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        {tradePullRefreshRegister}
        <CategoryEmptyState
          message="아직 등록된 글이 없어요."
          subMessage="첫 글을 올려보세요."
        />
      </>
    );
  }

  return (
    <>
      {tradePullRefreshRegister}
      <ul ref={listRootRef} className={`min-w-0 w-full max-w-full ${TRADE_FEED_LIST_WRAP_CLASS}`}>
        {posts.map((post, index) =>
          notInterestedPostIds.has(post.id) ? (
            <li key={post.id} className="min-w-0">
              <NotInterestedCard onUndo={() => handleUndoNotInterested(post.id)} />
            </li>
          ) : hiddenPostIds.has(post.id) ? (
            <li key={post.id} className="min-w-0">
              <HiddenPostCard postId={post.id} onUndo={() => handleUndoHide(post.id)} />
            </li>
          ) : (
            <Fragment key={post.id}>
              <li className="min-w-0">
                <PostCard
                  post={post}
                  skinKey={skinKey}
                  isFavorite={favoriteMap[post.id]}
                  onFavoriteChange={handleFavoriteChange}
                  onMenuAction={handleMenuAction}
                />
              </li>
              {shouldInjectFeedAdAtContentIndex(index, tradeCategoryAdPlan) ? (
                <FeedAdBannerCarousel
                  domain="trade"
                  placement="TRADE_CATEGORY"
                  categoryId={categoryId}
                  surfaceKey={tradeCategorySurfaceKey}
                  feedSessionId={tradeCategoryAdSessionId}
                  slotOrdinal={tradeCategoryAdPlan.slotOrdinalByContentIndex.get(index) ?? 0}
                />
              ) : null}
            </Fragment>
          )
        )}
      </ul>
      <TradeListLoadMoreFooter
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        visibleCount={posts.length}
        totalCount={posts.length}
        showCount={!hasMore}
      />

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-sam-surface-dark px-4 py-2 text-[14px] text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {reportPostId ? (
        <ReportReasonModal
          postId={reportPostId}
          open={!!reportPostId}
          onClose={() => setReportPostId((prev) => (prev === null ? prev : null))}
        />
      ) : null}
    </>
  );
}
