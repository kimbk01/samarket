"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getPostsByTradeCategoryIds,
  peekCachedTradeFeed,
  primeTradeFeedCache,
  type PostSort,
} from "@/lib/posts/getPostsByCategory";
import { TRADE_POST_LIST_CACHE_INVALIDATED } from "@/lib/posts/getPostsForHome";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { getFavoriteStatusForPosts } from "@/lib/favorites/getFavoriteStatusForPosts";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { PostCard } from "./PostCard";
import { HiddenPostCard } from "./HiddenPostCard";
import { NotInterestedCard } from "./NotInterestedCard";
import type { PostListMenuAction } from "./PostListMenuBottomSheet";

const ReportReasonModal = dynamic(
  () => import("./ReportReasonModal").then((m) => m.ReportReasonModal),
  { loading: () => null }
);
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";
import { computeTradeFeedKey, computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import { TRADE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { recordTradeListMetric } from "@/lib/runtime/trade-list-entry-debug";

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
  initialTradeFeed = null,
}: PostListByCategoryProps) {
  const router = useRouter();
  const effectiveIds = useMemo(() => {
    if (tradeFeedServerResolution) return [categoryId];
    if (filterCategoryIds && filterCategoryIds.length > 0) return filterCategoryIds;
    return [categoryId];
  }, [categoryId, filterCategoryIds, tradeFeedServerResolution]);

  const feedExtras = useMemo(
    () => ({
      jobEmploymentType: jobEmploymentType?.trim() || undefined,
      todayAvailable: todayAvailable === true,
    }),
    [jobEmploymentType, todayAvailable]
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
    return tradeFeedServerResolution
      ? peekCachedTradeFeed([], {
          page: 1,
          sort,
          jobsListingKind,
          tradeMarketParent: categoryId,
          topic: tradeTopicParam,
          jobEmploymentType: feedExtras.jobEmploymentType,
          todayAvailable: feedExtras.todayAvailable,
        })
      : peekCachedTradeFeed(effectiveIds, {
          page: 1,
          sort,
          jobsListingKind,
          jobEmploymentType: feedExtras.jobEmploymentType,
          todayAvailable: feedExtras.todayAvailable,
        });
  }, [
    categoryId,
    tradeFeedServerResolution,
    effectiveIds,
    sort,
    jobsListingKind,
    tradeTopicParam,
    feedExtras,
  ]);

  const [posts, setPosts] = useState<PostWithMeta[]>(() => initialCachedFeed?.posts ?? []);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(
    () => initialCachedFeed?.favoriteMap ?? {}
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initialCachedFeed);
  const [hasMore, setHasMore] = useState(() => initialCachedFeed?.hasMore === true);
  const [page, setPage] = useState(1);
  /** `feedKey` 변경 시 늦게 도착한 목록 응답이 상태를 덮어쓰지 않게 함 (`docs/trade-market-feed-contract.md`) */
  const listFeedEpochRef = useRef(0);
  /** 글 등록 직후 RSC bootstrap 이 클라 fetch 보다 느리면 stale 로 덮는 것 방지 */
  const allowRscBootstrapFeedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRootRef = useRef<HTMLUListElement | null>(null);
  const firstCardPaintStartRef = useRef(0);
  const firstCardPaintFeedKeyRef = useRef("");
  const routePrefetchAtRef = useRef<Record<string, number>>({});
  const favoriteFetchEpochRef = useRef(0);

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
    async (pageNum: number = 1) => {
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
      const epoch = listFeedEpochRef.current;
      setLoading((prev) => (prev ? prev : true));
      try {
        const useHomePostsApi =
          tradeFeedServerResolution &&
          jobsListingKind !== "hire" &&
          jobsListingKind !== "work" &&
          !tradeTopicParam.trim();

        if (useHomePostsApi) {
          /** `/api/philife/posts` 가 아니라 `/api/trade/feed` — 마켓 bootstrap·관리자 trade-expand 와 동일 id·쿼리 */
          const next = await getPostsByTradeCategoryIds([], {
            page: pageNum,
            sort,
            tradeMarketParent: categoryId,
            topic: "",
            jobEmploymentType: feedExtras.jobEmploymentType,
            todayAvailable: feedExtras.todayAvailable,
          });
          if (epoch !== listFeedEpochRef.current) return;
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
            resolveFavoriteMapAsync(next.posts, pageNum, epoch);
          }
          return;
        }

        const next = await getPostsByTradeCategoryIds(
          tradeFeedServerResolution ? [] : effectiveIds,
          {
            page: pageNum,
            sort,
            jobsListingKind,
            jobEmploymentType: feedExtras.jobEmploymentType,
            todayAvailable: feedExtras.todayAvailable,
            ...(tradeFeedServerResolution
              ? {
                  tradeMarketParent: categoryId,
                  topic: tradeTopicParam,
                }
              : {}),
          }
        );
        if (epoch !== listFeedEpochRef.current) return;
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
          resolveFavoriteMapAsync(next.posts, pageNum, epoch);
        }
      } finally {
        setLoading(false);
        allowRscBootstrapFeedRef.current = true;
      }
    },
    [
      categoryId,
      sort,
      effectiveIds,
      jobsListingKind,
      tradeFeedServerResolution,
      tradeTopicParam,
      resolveFavoriteMapAsync,
      feedExtras,
    ]
  );

  useEffect(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (posts.length === 0) return;
    const now = Date.now();
    for (const post of posts.slice(0, 10)) {
      const postId = (post.id ?? "").trim();
      if (!postId) continue;
      const href = `/post/${encodeURIComponent(postId)}`;
      const last = routePrefetchAtRef.current[href] ?? 0;
      if (now - last < 15_000) continue;
      routePrefetchAtRef.current[href] = now;
      void router.prefetch(href);
    }
  }, [posts, router]);

  useEffect(() => {
    let cancelled = false;
    listFeedEpochRef.current += 1;
    const epoch = listFeedEpochRef.current;
    setPage(1);

    (async () => {
      if (allowRscBootstrapFeedRef.current && initialTradeFeed && initialTradeFeed.feedKey === feedKey) {
        setPosts(initialTradeFeed.posts);
        setHasMore(initialTradeFeed.hasMore);
        setHiddenPostIds(new Set());
        setNotInterestedPostIds(new Set());
        setFavoriteMap(initialTradeFeed.favoriteMap ?? {});
        setLoading(false);
        const useHomePostsApi =
          tradeFeedServerResolution &&
          jobsListingKind !== "hire" &&
          jobsListingKind !== "work" &&
          !tradeTopicParam.trim();
        if (tradeFeedServerResolution) {
          if (useHomePostsApi) {
            primeTradeFeedCache(
              [],
              {
                page: 1,
                sort,
                tradeMarketParent: categoryId,
                topic: "",
                jobEmploymentType: feedExtras.jobEmploymentType,
                todayAvailable: feedExtras.todayAvailable,
              },
              {
                posts: initialTradeFeed.posts,
                hasMore: initialTradeFeed.hasMore,
                ...(initialTradeFeed.favoriteMap !== undefined ?
                  { favoriteMap: initialTradeFeed.favoriteMap }
                : {}),
              }
            );
          } else {
            primeTradeFeedCache(
              [],
              {
                page: 1,
                sort,
                jobsListingKind,
                tradeMarketParent: categoryId,
                topic: tradeTopicParam,
                jobEmploymentType: feedExtras.jobEmploymentType,
                todayAvailable: feedExtras.todayAvailable,
              },
              {
                posts: initialTradeFeed.posts,
                hasMore: initialTradeFeed.hasMore,
                ...(initialTradeFeed.favoriteMap !== undefined ?
                  { favoriteMap: initialTradeFeed.favoriteMap }
                : {}),
              }
            );
          }
        } else {
          primeTradeFeedCache(
            effectiveIds,
            {
              page: 1,
              sort,
              jobsListingKind,
              jobEmploymentType: feedExtras.jobEmploymentType,
              todayAvailable: feedExtras.todayAvailable,
            },
            {
              posts: initialTradeFeed.posts,
              hasMore: initialTradeFeed.hasMore,
              ...(initialTradeFeed.favoriteMap !== undefined ?
                { favoriteMap: initialTradeFeed.favoriteMap }
              : {}),
            }
          );
        }
        if (initialTradeFeed.favoriteMap === undefined) {
          resolveFavoriteMapAsync(initialTradeFeed.posts, 1, epoch);
        }
        return;
      }
      const cached = tradeFeedServerResolution
        ? peekCachedTradeFeed([], {
            page: 1,
            sort,
            jobsListingKind,
            tradeMarketParent: categoryId,
            topic: tradeTopicParam,
            jobEmploymentType: feedExtras.jobEmploymentType,
            todayAvailable: feedExtras.todayAvailable,
          })
        : peekCachedTradeFeed(effectiveIds, {
            page: 1,
            sort,
            jobsListingKind,
            jobEmploymentType: feedExtras.jobEmploymentType,
            todayAvailable: feedExtras.todayAvailable,
          });
      if (cached) {
        setPosts(cached.posts);
        setHasMore(cached.hasMore);
        setHiddenPostIds(new Set());
        setNotInterestedPostIds(new Set());
        setFavoriteMap(cached.favoriteMap ?? {});
        setLoading(false);
        return;
      }
      await load(1);
    })();

    return () => {
      cancelled = true;
    };
  }, [feedKey, initialTradeFeed?.feedKey, load, resolveFavoriteMapAsync, feedExtras]);

  /** 글쓰기 완료 등 — 캐시 무효화 후 동일 피드에 머물러도 네트워크로 최신 목록 */
  useEffect(() => {
    const onBust = () => {
      allowRscBootstrapFeedRef.current = false;
      listFeedEpochRef.current += 1;
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

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    load(next);
  }, [loading, hasMore, page, load]);

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

  if (loading && posts.length === 0) {
    return (
      <div className="py-8 text-center text-[14px] text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <CategoryEmptyState
        message="아직 등록된 글이 없어요."
        subMessage="첫 글을 올려보세요."
      />
    );
  }

  const skinKey = category?.icon_key ?? undefined;

  return (
    <>
      <ul ref={listRootRef} className={`min-w-0 w-full max-w-full ${TRADE_FEED_LIST_WRAP_CLASS}`}>
        {posts.map((post) =>
          notInterestedPostIds.has(post.id) ? (
            <li key={post.id} className="min-w-0">
              <NotInterestedCard onUndo={() => handleUndoNotInterested(post.id)} />
            </li>
          ) : hiddenPostIds.has(post.id) ? (
            <li key={post.id} className="min-w-0">
              <HiddenPostCard postId={post.id} onUndo={() => handleUndoHide(post.id)} />
            </li>
          ) : (
            <li key={post.id} className="min-w-0">
              <PostCard
                post={post}
                skinKey={skinKey}
                isFavorite={favoriteMap[post.id]}
                onFavoriteChange={handleFavoriteChange}
                onMenuAction={handleMenuAction}
              />
            </li>
          )
        )}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-3 w-full py-3 text-[14px] text-sam-muted disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더보기"}
        </button>
      ) : null}

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
