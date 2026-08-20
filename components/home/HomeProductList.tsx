"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PostCard } from "@/components/post/PostCard";
import { HiddenPostCard } from "@/components/post/HiddenPostCard";
import { NotInterestedCard } from "@/components/post/NotInterestedCard";
import type { PostListMenuAction } from "@/components/post/PostListMenuBottomSheet";
import {
  getPostsForHome,
  invalidateHomePostsCache,
  peekCachedPostsForHome,
  primeHomePostsCache,
  TRADE_POST_LIST_CACHE_INVALIDATED,
  type GetPostsForHomeOptions,
  type GetPostsForHomeResult,
} from "@/lib/posts/getPostsForHome";
import type { HomeTradeStateFilter } from "@/lib/posts/getPostsForHome";
import { FEED_LCP_PRIORITY_COUNT } from "@/lib/media/feed-thumbnail-display";
import type { PostWithMeta } from "@/lib/posts/schema";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
  tryTrackFirstMenuListFetchStart,
  tryTrackFirstMenuListFetchSuccess,
  tryTrackFirstMenuListRender,
} from "@/lib/runtime/samarket-runtime-debug";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import {
  recordTradeListTotalMs,
  sampleTradeMemoryHeapUsedMb,
} from "@/lib/trade/trade-c2c-perf-metrics";
import { TRADE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import {
  countPendingNewHomeListings,
  patchHomeTradePostsInPlace,
} from "@/lib/trade/marketplace/home-list-freshness";
import { TradeFeedBufferingSpinner } from "@/components/trade/TradeFeedBufferingSpinner";
import { TradeListLoadMoreFooter } from "@/components/trade/TradeListLoadMoreFooter";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
  rememberTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";
import { useTradeMarketplaceLocationHydrate } from "@/lib/trade/location/use-trade-marketplace-location-hydrate";
import { marketplaceLocationFetchGate } from "@/lib/trade/marketplace/client-location-fetch";
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
import { TRADE_BROWSE_LOCATION_PATH } from "@/lib/trade/location/trade-browse-location-paths";
import { rememberTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { useTradeChatListClientPagination } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination";
import { MARKETPLACE_LIST_CLIENT_PAGE_SIZE } from "@/lib/trade/marketplace/marketplace-list-pagination";
import { tradeListPaginationResetKey } from "@/lib/trade/trade-list-pagination-reset-key";
import { MARKETPLACE_BROWSE_RESET_EVENT } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import { TradeMarketPullRefreshRegister } from "@/components/trade/TradeMarketPullRefreshRegister";
import { resolveTradeMarketPullRefreshRouteKey } from "@/lib/trade/trade-market-pull-refresh-surface";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { Fragment } from "react";
import { FeedAdBannerCarousel } from "@/components/ads/FeedAdBannerCarousel";
import {
  feedAdSlotSeed,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
} from "@/lib/ads/feed-ad-slot-policy";
import { getOrCreateFeedAdSessionId } from "@/lib/ads/feed-ad-session";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";
import {
  marketplaceBrowseStateIdentityKey,
  marketplaceBrowseStateToGetPostsForHomeOptions,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";

const ReportReasonModal = dynamic(
  () => import("@/components/post/ReportReasonModal").then((m) => m.ReportReasonModal),
  { loading: () => null }
);

type ListState = "idle" | "loading" | "error" | "empty";
const MIN_SILENT_REFRESH_GAP_MS = 30_000;
function normalizeTradeStateFromQuery(raw: string | null): HomeTradeStateFilter {
  return parseMarketplacePublicTradeState(raw);
}

const INITIAL_VISIBLE_CARD_COUNT = MARKETPLACE_LIST_CLIENT_PAGE_SIZE;

/** Background refresh — 동일 row 참조 유지 (전체 list replace 금지). */
function isSameHomeTradePostRow(a: PostWithMeta, b: PostWithMeta): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.price === b.price &&
    a.status === b.status &&
    a.thumbnail_url === b.thumbnail_url &&
    a.updated_at === b.updated_at &&
    a.author_nickname === b.author_nickname &&
    a.author_avatar_url === b.author_avatar_url &&
    a.favorite_count === b.favorite_count &&
    a.seller_listing_state === b.seller_listing_state &&
    a.view_count === b.view_count &&
    a.reserved_buyer_id === b.reserved_buyer_id
  );
}

function patchHomeTradePostsRows(prev: PostWithMeta[], incoming: PostWithMeta[]): PostWithMeta[] {
  if (prev === incoming) return prev;
  if (prev.length === incoming.length && prev.every((row, i) => row === incoming[i])) return prev;
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const out = incoming.map((row) => {
    const old = prevById.get(row.id);
    if (old && isSameHomeTradePostRow(old, row)) return old;
    return row;
  });
  if (out.length === prev.length && out.every((row, i) => row === prev[i])) return prev;
  return out;
}

/**
 * SSR + 클라이언트 첫 렌더에서만 사용 — 메모리/sessionStorage 캐시를 읽지 않음.
 * 그렇지 않으면 서버(캐시 없음) ≠ 클라(캐시 히트) 로 `<ul>` 트리가 달라져 hydration 오류가 난다.
 */
function getHydrationSafeBoot(
  tradeState: HomeTradeStateFilter,
  initialHomeTradeFeed: GetPostsForHomeResult | null | undefined
): GetPostsForHomeResult | null {
  if (tradeState === "latest") {
    return initialHomeTradeFeed ?? null;
  }
  return null;
}

function readClientHomeListBoot(options: GetPostsForHomeOptions): GetPostsForHomeResult | null {
  if (typeof window === "undefined") return null;
  return peekCachedPostsForHome(options);
}

export function HomeProductList({
  initialHomeTradeFeed,
  /** push 들어오는 패널 — 첫 페인트 전 캐시 병합(스켈레톤 1프레임 방지) */
  clientInstantBoot = false,
}: {
  /** 서버(RSC)에서 채운 첫 페이지 — 마운트 시 클라이언트 재요청 생략 */
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
  clientInstantBoot?: boolean;
}) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { unresolved: locationUnresolved } = useTradeMarketplaceLocationHydrate();
  const { propsForCategoryId } = useTradeListCompositionMap();
  const tradeState = normalizeTradeStateFromQuery(searchParams.get("tradeState"));
  const q = sanitizeMarketplaceQueryText(searchParams.get("q")) ?? null;
  const locationScope = useMemo(
    () => parseTradeLocationScopeFromSearchParams(searchParams),
    [searchParams]
  );
  const locationInvalid =
    locationScope.mode === "invalid" && !locationUnresolved;
  const locationUnset = locationScope.mode === "unset";
  const locationAll = locationScope.mode === "all";
  const locGate = marketplaceLocationFetchGate(locationScope);
  const lguCityId = locationScope.mode === "city" ? locationScope.lguId : null;
  const radiusKm = locationScope.mode === "city" ? locationScope.radiusKm : null;
  const [cityEmptyLabel, setCityEmptyLabel] = useState<string | null>(() =>
    locationScope.mode === "city" ? peekTradeLguDisplayLabel(locationScope.canonicalId) : null
  );
  useEffect(() => {
    if (locationScope.mode !== "city") {
      setCityEmptyLabel(null);
      return;
    }
    const peek = peekTradeLguDisplayLabel(locationScope.canonicalId);
    if (peek) {
      setCityEmptyLabel(peek);
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/trade/national-lgu?id=${encodeURIComponent(locationScope.canonicalId)}`,
      { credentials: "same-origin", cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { item?: { displayName?: string } } | null) => {
        if (cancelled) return;
        const name = json?.item?.displayName?.trim() ?? "";
        if (!name) return;
        rememberTradeLguDisplayLabel(locationScope.canonicalId, name);
        setCityEmptyLabel(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locationScope]);

  const browseState = useMemo(
    () => parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const browseIdentityKey = useMemo(
    () => marketplaceBrowseStateIdentityKey(browseState),
    [browseState]
  );
  const homePostListOptions = useMemo<GetPostsForHomeOptions>(
    () => marketplaceBrowseStateToGetPostsForHomeOptions(browseState),
    [browseState]
  );
  const { tt } = useI18n();
  const hydrationSeed =
    locationAll && !locationInvalid && !q
      ? getHydrationSafeBoot(tradeState, initialHomeTradeFeed)
      : null;
  const clientBoot =
    typeof window !== "undefined" &&
    tradeState === "latest" &&
    locGate.canFetch &&
    (clientInstantBoot || !hydrationSeed)
      ? readClientHomeListBoot(homePostListOptions)
      : null;
  const initialBoot = clientBoot ?? hydrationSeed;
  const [listState, setListState] = useState<ListState>(() =>
    initialBoot ? (initialBoot.posts.length === 0 ? "empty" : "idle") : "loading"
  );
  const [posts, setPosts] = useState<PostWithMeta[]>(() => initialBoot?.posts ?? []);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(
    () => initialBoot?.favoriteMap ?? {}
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const lastLoadedAtRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const silentRequestIdRef = useRef(0);
  const listMountedRef = useRef(true);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  /** 글 등록 직후 `router.refresh()` 등으로 RSC 시드가 늦게 와도, 클라 `load()` 결과를 덮어쓰지 않게 함 */
  const allowRscHomeListSeedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 시드·세션·메모리 캐시 — 첫 페인트는 INITIAL_VISIBLE_CARD_COUNT 까지만, 더보기로 펼침 */
  const listMeasureRef = useRef<HTMLUListElement | null>(null);
  const listFeedEpochRef = useRef(0);
  const [listPaginationEpoch, setListPaginationEpoch] = useState(0);
  const serverPageRef = useRef(1);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [loadingMoreServer, setLoadingMoreServer] = useState(false);
  const browseIdentityPrevRef = useRef<string | null>(null);
  const browseIdentityInitializedRef = useRef(false);
  const silentRefreshIdentityRef = useRef(browseIdentityKey);
  silentRefreshIdentityRef.current = browseIdentityKey;

  const detectBrowseIdentityTransition = useCallback((currentKey: string): boolean => {
    if (!browseIdentityInitializedRef.current) {
      browseIdentityInitializedRef.current = true;
      browseIdentityPrevRef.current = currentKey;
      return false;
    }
    const prev = browseIdentityPrevRef.current;
    if (prev === currentKey) return false;
    browseIdentityPrevRef.current = currentKey;
    return true;
  }, []);

  const load = useCallback(async (opts?: { forceFreshRankedWindow?: boolean; replaceList?: boolean }) => {
    silentRequestIdRef.current += 1;
    if (locationInvalid) {
      setPosts([]);
      setFavoriteMap({});
      setPendingNewCount(0);
      setListState("empty");
      lastLoadedAtRef.current = Date.now();
      return;
    }
    if (locationUnset) {
      setListState("loading");
      return;
    }
    const requestId = ++latestRequestIdRef.current;
    const listOpts = homePostListOptions;
    /**
     * `getPostsForHome` 는 signal 없이 호출해야 `home-posts-fetch:${cacheKey}` 단일 비행에 합류한다.
     * signal 분기는 이 단일 비행을 우회해, BottomNav·MarketContent prewarm 과 **이중 fetch**가 났다.
     */
    if (lastLoadedAtRef.current === 0) {
      setListState("loading");
    }
    const firstNetworkList = lastLoadedAtRef.current === 0;
    let tradeFetchT0 = 0;
    if (firstNetworkList) {
      tryTrackFirstMenuListFetchStart();
      bumpAppWidePerf("trade_list_fetch_start");
      tradeFetchT0 = performance.now();
    }
    try {
      const res = await getPostsForHome({
        ...listOpts,
        page: 1,
        forceFreshRankedWindow: opts?.forceFreshRankedWindow,
      });
      if (!listMountedRef.current || requestId !== latestRequestIdRef.current) return;
      serverPageRef.current = 1;
      setServerHasMore(res.hasMore);
      const replaceList = opts?.replaceList === true || opts?.forceFreshRankedWindow === true;
      if (replaceList) {
        setPosts(res.posts);
      } else {
        setPosts((prev) => patchHomeTradePostsRows(prev, res.posts));
      }
      setFavoriteMap(res.favoriteMap);
      setPendingNewCount(0);
      lastLoadedAtRef.current = Date.now();
      setListState(res.posts.length === 0 ? "empty" : "idle");
      if (firstNetworkList) {
        bumpAppWidePerf("trade_list_fetch_success");
        recordAppWidePhaseLastMs("trade_list_fetch_ms", Math.round(performance.now() - tradeFetchT0));
        tryTrackFirstMenuListFetchSuccess();
        bumpAppWidePerf("trade_list_render");
        tryTrackFirstMenuListRender();
        const paintT0 = tradeFetchT0;
        queueMicrotask(() => {
          if (!listMountedRef.current) return;
          if (typeof requestAnimationFrame !== "function") return;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!listMountedRef.current) return;
              const totalMs = Math.round(performance.now() - paintT0);
              recordAppWidePhaseLastMs("trade_list_to_paint_ms", totalMs);
              recordTradeListTotalMs(totalMs);
              sampleTradeMemoryHeapUsedMb();
            });
          });
        });
      }
    } catch {
      if (!listMountedRef.current || requestId !== latestRequestIdRef.current) return;
      /* 실패 시 빈 목록으로 오인하지 않음 — 직전 성공 데이터 유지 */
      setListState("error");
    } finally {
      if (requestId === latestRequestIdRef.current) {
        allowRscHomeListSeedRef.current = true;
      }
    }
  }, [homePostListOptions, locationInvalid, locationUnset]);

  const pullRefreshRouteKey = useMemo(
    () => resolveTradeMarketPullRefreshRouteKey(pathname, searchParams),
    [pathname, searchParams]
  );

  const onPullRefresh = useCallback(async () => {
    invalidateHomePostsCache({ notifyListReload: false });
    allowRscHomeListSeedRef.current = false;
    listFeedEpochRef.current += 1;
    latestRequestIdRef.current += 1;
    serverPageRef.current = 1;
    setServerHasMore(false);
    setListPaginationEpoch((n) => n + 1);
    setPendingNewCount(0);
    await load({
      forceFreshRankedWindow: true,
      replaceList: true,
    });
  }, [load]);

  const tradePullRefreshRegister =
    pullRefreshRouteKey != null ? (
      <TradeMarketPullRefreshRegister routeKey={pullRefreshRouteKey} onRefresh={onPullRefresh} />
    ) : null;

  useEffect(() => {
    serverPageRef.current = 1;
    setServerHasMore(false);
  }, [homePostListOptions]);

  /**
   * 클라이언트에서만 메모리·sessionStorage 캐시를 병합한다.
   * 첫 렌더는 `hydrationSeed`만 사용해 서버 HTML과 일치시킨다.
   */
  useLayoutEffect(() => {
    if (locationInvalid) {
      silentRequestIdRef.current += 1;
      setPosts([]);
      setFavoriteMap({});
      setPendingNewCount(0);
      setListState("empty");
      lastLoadedAtRef.current = Date.now();
      return;
    }

    if (locationUnset) {
      setListState("loading");
      return;
    }

    if (initialHomeTradeFeed && allowRscHomeListSeedRef.current && locationAll && !q) {
      primeHomePostsCache(
        homePostListOptions,
        initialHomeTradeFeed
      );
    }

    const boot =
      tradeState === "latest" && allowRscHomeListSeedRef.current && locationAll && !q
        ? initialHomeTradeFeed ?? peekCachedPostsForHome(homePostListOptions)
        : peekCachedPostsForHome(homePostListOptions);

    const identityTransition = detectBrowseIdentityTransition(browseIdentityKey);

    if (identityTransition) {
      silentRequestIdRef.current += 1;
      serverPageRef.current = 1;
      setServerHasMore(false);
      setListPaginationEpoch((n) => n + 1);
      allowRscHomeListSeedRef.current = false;
      setPosts([]);
      setFavoriteMap({});
      setPendingNewCount(0);
    }

    if (boot && !identityTransition) {
      silentRequestIdRef.current += 1;
      serverPageRef.current = 1;
      setServerHasMore(boot.hasMore === true);
      setPosts((prev) => patchHomeTradePostsRows(prev, boot.posts));
      setFavoriteMap(boot.favoriteMap ?? {});
      setPendingNewCount(0);
      setListState(boot.posts.length === 0 ? "empty" : "idle");
      lastLoadedAtRef.current = Date.now();
      return;
    }

    if (boot && identityTransition) {
      silentRequestIdRef.current += 1;
      serverPageRef.current = 1;
      setServerHasMore(boot.hasMore === true);
      setPosts(boot.posts);
      setFavoriteMap(boot.favoriteMap ?? {});
      setPendingNewCount(0);
      setListState(boot.posts.length === 0 ? "empty" : "idle");
      lastLoadedAtRef.current = Date.now();
      return;
    }

    if (identityTransition) {
      setListState("loading");
    }

    void load({
      forceFreshRankedWindow: !!q || identityTransition,
      replaceList: identityTransition || !!q,
    });
  }, [
    tradeState,
    lguCityId,
    locationAll,
    locationUnset,
    initialHomeTradeFeed,
    load,
    homePostListOptions,
    locationInvalid,
    q,
    browseIdentityKey,
    detectBrowseIdentityTransition,
  ]);

  useEffect(() => {
    const q = searchParams.toString();
    rememberTradeListReturnHref(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams]);

  /** 글쓰기 완료 등으로 캐시만 비울 때 — 동일 URL에 머물러도 즉시 재요청 */
  useEffect(() => {
    const onBust = () => {
      allowRscHomeListSeedRef.current = false;
      void load();
    };
    window.addEventListener(TRADE_POST_LIST_CACHE_INVALIDATED, onBust);
    return () => window.removeEventListener(TRADE_POST_LIST_CACHE_INVALIDATED, onBust);
  }, [load]);

  /**
   * 리스트→상세 체감: 상단 카드 `/post/:id` idle prefetch (제거 시 회귀).
   * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
   */
  useEffect(() => {
    if (posts.length === 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const cap = Math.min(INITIAL_VISIBLE_CARD_COUNT, posts.length);
      for (let i = 0; i < cap; i++) {
        const pid = posts[i]?.id?.trim();
        if (pid) void router.prefetch(`/post/${encodeURIComponent(pid)}`);
      }
    }, 480);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [posts, router]);

  const listPagination = useTradeChatListClientPagination({
    items: posts,
    pageSize: MARKETPLACE_LIST_CLIENT_PAGE_SIZE,
    resetKey: `${tradeListPaginationResetKey(tradeState, posts)}:${listPaginationEpoch}`,
  });
  const visiblePosts = listPagination.visibleItems;

  const loadMoreFeed = useCallback(async () => {
    if (listPagination.hasMore) {
      listPagination.loadMore();
      return;
    }
    if (!serverHasMore || loadingMoreServer || locationInvalid || locationUnset) return;
    setLoadingMoreServer(true);
    const nextPage = serverPageRef.current + 1;
    const requestId = ++latestRequestIdRef.current;
    try {
      const res = await getPostsForHome({
        ...homePostListOptions,
        page: nextPage,
      });
      if (!listMountedRef.current || requestId !== latestRequestIdRef.current) return;
      serverPageRef.current = nextPage;
      setServerHasMore(res.hasMore);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = res.posts.filter((p) => {
          const id = p.id?.trim();
          return id && !seen.has(id);
        });
        return appended.length > 0 ? [...prev, ...appended] : prev;
      });
      setFavoriteMap((prev) => ({ ...prev, ...res.favoriteMap }));
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoadingMoreServer(false);
      }
    }
  }, [
    homePostListOptions,
    listPagination.hasMore,
    listPagination.loadMore,
    loadingMoreServer,
    locationInvalid,
    locationUnset,
    serverHasMore,
  ]);
  const tradeHomeAdSessionId = useMemo(
    () => getOrCreateFeedAdSessionId("trade:home"),
    []
  );
  const tradeHomeAdPlan = useMemo(
    () =>
      planFeedAdSlots(
        visiblePosts.length,
        feedAdSlotSeed({
          surfaceKey: "trade:home",
          feedSessionId: tradeHomeAdSessionId,
        })
      ),
    [visiblePosts.length, tradeHomeAdSessionId]
  );

  /**
   * CUT H: silent fetch must not apply incoming order (auto unshift).
   * Pending N = unseen incoming ids. PTR / cache-bust `load()` still applies page-1.
   */
  const refreshSilent = useCallback(async () => {
    if (locationInvalid || locationUnset) return;
    if (q) return;
    if (Date.now() - lastLoadedAtRef.current < MIN_SILENT_REFRESH_GAP_MS) {
      return;
    }
    const requestId = ++silentRequestIdRef.current;
    const refreshIdentity = silentRefreshIdentityRef.current;
    if (browseIdentityPrevRef.current !== refreshIdentity) {
      return;
    }
    try {
      const res = await getPostsForHome(homePostListOptions);
      if (!listMountedRef.current || requestId !== silentRequestIdRef.current) return;
      if (browseIdentityPrevRef.current !== refreshIdentity) return;
      const current = postsRef.current;
      if (current.length === 0) {
        setPosts((prev) => patchHomeTradePostsRows(prev, res.posts));
        setPendingNewCount(0);
      } else {
        setPosts((prev) => patchHomeTradePostsInPlace(prev, res.posts, isSameHomeTradePostRow));
        setPendingNewCount(countPendingNewHomeListings(current, res.posts));
      }
      setFavoriteMap(res.favoriteMap);
      lastLoadedAtRef.current = Date.now();
    } catch {
      if (!listMountedRef.current || requestId !== silentRequestIdRef.current) return;
      /* 기존 목록 유지 */
    }
  }, [homePostListOptions, locationInvalid, locationUnset, q]);

  const applyPendingHomeFreshness = useCallback(async () => {
    setPendingNewCount(0);
    invalidateHomePostsCache({ notifyListReload: false });
    allowRscHomeListSeedRef.current = false;
    await load();
  }, [load]);

  useEffect(() => {
    const onReset = () => {
      serverPageRef.current = 1;
      setServerHasMore(false);
      setListPaginationEpoch((n) => n + 1);
      allowRscHomeListSeedRef.current = false;
      browseIdentityInitializedRef.current = false;
      browseIdentityPrevRef.current = null;
      latestRequestIdRef.current += 1;
      silentRequestIdRef.current += 1;
      lastLoadedAtRef.current = 0;
      setPosts([]);
      setFavoriteMap({});
      setPendingNewCount(0);
      setListState("loading");
    };
    window.addEventListener(MARKETPLACE_BROWSE_RESET_EVENT, onReset);
    return () => window.removeEventListener(MARKETPLACE_BROWSE_RESET_EVENT, onReset);
  }, []);

  /** bfcache 복원 + 탭/앱 복귀 + 포커스만 바뀌는 복귀 — 한 훅·동일 디바운스 정책 */
  useRefetchOnPageShowRestore(() => void refreshSilent(), {
    enableVisibilityRefetch: true,
    visibilityDebounceMs: 450,
    enableWindowFocusRefetch: true,
    windowFocusDebounceMs: 400,
  });

  useEffect(() => {
    listMountedRef.current = true;
    return () => {
      listMountedRef.current = false;
      latestRequestIdRef.current += 1;
      silentRequestIdRef.current += 1;
    };
  }, []);

  /** 다른 화면(상세·시트 등)에서 찜 변경 시 하트 표시 동기화 */
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

  const handleRetry = useCallback(() => {
    setListState("loading");
    void load();
  }, [load]);

  const handleMenuAction = useCallback((postId: string, action: PostListMenuAction) => {
    if (action === "interest") {
      setToast(tt("관심 있음으로 표시했어요"));
      if (toastTimerRef.current != null) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        toastTimerRef.current = null;
        setToast(null);
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

  const handleFavoriteChange = useCallback((postId: string, isFavorite: boolean) => {
    setFavoriteMap((prev) => ({ ...prev, [postId]: isFavorite }));
  }, []);

  const showEmpty =
    locationInvalid ||
    locationUnresolved ||
    listState === "empty" ||
    (!locationUnset && posts.length === 0);
  const showError = listState === "error";
  const showLoading =
    !locationInvalid &&
    (locationUnresolved || listState === "loading" || locationUnset);
  const rootClass = "min-w-0 w-full max-w-full";
  /** 거래 전용 `<ul>` — 카드 간·리스트 상하 여백 최소(`TRADE_FEED_LIST_WRAP_CLASS`) */
  const listClass = TRADE_FEED_LIST_WRAP_CLASS;

  useLayoutEffect(() => {
    if (showLoading || showError || showEmpty) return;
    const mapItemCount =
      posts.length === 0
        ? 0
        : Math.min(posts.length, listPagination.visibleCount > 0 ? listPagination.visibleCount : posts.length);
    recordTradeListMetricOnce("trade_list_product_list_render_start_ms");
    recordTradeListMetricOnce("trade_list_first_render_map_item_count", mapItemCount);
    recordTradeListMetricOnce("trade_list_product_list_render_end_ms");
    const root = listMeasureRef.current;
    if (!root) return;
    const links = Array.from(root.querySelectorAll('a[href^="/post/"]')).filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement
    );
    if (links.length > 0) {
      const initialVisibleCount = links.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }).length;
      recordTradeListMetricOnce("trade_list_initial_visible_card_count", initialVisibleCount);
    }
    recordTradeListMetricOnce("trade_list_first_render_image_component_count", root.querySelectorAll("img").length);
  }, [showEmpty, showError, showLoading, listPagination.visibleCount, posts.length]);

  if (showLoading) {
    return (
      <>
        {tradePullRefreshRegister}
        <div className={rootClass}>
          <NonSkeletonLoadingState />
        </div>
      </>
    );
  }

  if (showError) {
    return (
      <>
        {tradePullRefreshRegister}
        <div className={rootClass}>
          <ErrorState onRetry={handleRetry} />
        </div>
      </>
    );
  }

  if (showEmpty) {
    const cityLabel = q?.trim() ? null : cityEmptyLabel;
    if (locationUnresolved) {
      return (
        <>
          {tradePullRefreshRegister}
          <div className={rootClass}>
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-[14px] text-sam-muted">{t("trade_location_my_region_missing")}</p>
              <button
                type="button"
                className="text-[14px] font-medium text-signature"
                onClick={() => {
                  const q = searchParams.toString();
                  router.push(q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH);
                }}
              >
                {t("trade_location_sheet_title")}
              </button>
            </div>
          </div>
        </>
      );
    }
    if (locationInvalid) {
      return (
        <>
          {tradePullRefreshRegister}
          <div className={rootClass}>
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
          </div>
        </>
      );
    }
    return (
      <>
        {tradePullRefreshRegister}
        <div className={rootClass}>
          {cityLabel ? (
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
          ) : (
            <EmptyState />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {tradePullRefreshRegister}
      {pendingNewCount > 0 && !q ? (
        <div className="sticky top-0 z-[9] flex justify-center py-2">
          <button
            type="button"
            className="rounded-full bg-signature px-4 py-2 text-[14px] font-semibold text-white"
            onClick={() => void applyPendingHomeFreshness()}
          >
            {safeT("trade_market_new_listings_cta", {
              vars: { count: pendingNewCount },
              fallbackKo: `새 매물 ${pendingNewCount}개`,
              fallbackEn: `${pendingNewCount} new listings`,
            })}
          </button>
        </div>
      ) : null}
      <ul ref={listMeasureRef} className={`${rootClass} ${listClass}`}>
        {visiblePosts.map((post, index) =>
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
                {(() => {
                  const composition = propsForCategoryId(post.category_id);
                  return (
                    <PostCard
                      post={post}
                      isFirstCard={index === 0}
                      priorityThumb={index < FEED_LCP_PRIORITY_COUNT}
                      isFavorite={favoriteMap[post.id]}
                      onFavoriteChange={handleFavoriteChange}
                      onMenuAction={handleMenuAction}
                      skinKey={composition?.skinKey}
                      categorySlug={composition?.categorySlug}
                      fieldComposition={composition?.fieldComposition}
                    />
                  );
                })()}
              </li>
              {shouldInjectFeedAdAtContentIndex(index, tradeHomeAdPlan) ? (
                <FeedAdBannerCarousel
                  domain="trade"
                  placement="TRADE_HOME"
                  surfaceKey="trade:home"
                  feedSessionId={tradeHomeAdSessionId}
                  slotOrdinal={tradeHomeAdPlan.slotOrdinalByContentIndex.get(index) ?? 0}
                />
              ) : null}
            </Fragment>
          )
        )}
      </ul>

      <TradeListLoadMoreFooter
        hasMore={listPagination.hasMore || serverHasMore}
        loadingMore={listPagination.loadingMore || loadingMoreServer}
        onLoadMore={() => void loadMoreFeed()}
        visibleCount={listPagination.visibleCount}
        totalCount={listPagination.totalCount}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-sam-surface-dark px-4 py-2 text-[14px] text-white shadow-lg">
          {toast}
        </div>
      )}

      {reportPostId && (
        <ReportReasonModal
          postId={reportPostId}
          open={!!reportPostId}
          onClose={() => setReportPostId(null)}
        />
      )}
    </>
  );
}

function NonSkeletonLoadingState() {
  return (
    <div
      className="flex min-h-[min(42vh,360px)] items-center justify-center bg-sam-app"
      aria-busy="true"
    >
      <TradeFeedBufferingSpinner />
    </div>
  );
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-[14px] text-sam-muted">{t("trade_055")}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-[14px] text-sam-muted">{t("trade_060")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-[14px] font-medium text-signature"
      >
        다시 시도
      </button>
    </div>
  );
}
