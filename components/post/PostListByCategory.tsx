"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPostsByTradeCategoryIds,
  primeTradeFeedCache,
  type PostSort,
} from "@/lib/posts/getPostsByCategory";
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
  initialTradeFeed = null,
}: PostListByCategoryProps) {
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  /** `feedKey` 변경 시 늦게 도착한 목록 응답이 상태를 덮어쓰지 않게 함 (`docs/trade-market-feed-contract.md`) */
  const listFeedEpochRef = useRef(0);

  const effectiveIds = useMemo(() => {
    if (tradeFeedServerResolution) return [categoryId];
    if (filterCategoryIds && filterCategoryIds.length > 0) return filterCategoryIds;
    return [categoryId];
  }, [categoryId, filterCategoryIds, tradeFeedServerResolution]);

  const feedKey = useMemo(
    () =>
      tradeFeedServerResolution
        ? computeTradeFeedKeyForMarketParent(categoryId, tradeTopicParam, sort, jobsListingKind)
        : computeTradeFeedKey(effectiveIds, sort, jobsListingKind),
    [
      tradeFeedServerResolution,
      categoryId,
      tradeTopicParam,
      effectiveIds,
      sort,
      jobsListingKind,
    ]
  );

  const load = useCallback(
    async (pageNum: number = 1) => {
      if (!categoryId) {
        setLoading(false);
        return;
      }
      if (!tradeFeedServerResolution && effectiveIds.length === 0) {
        setLoading(false);
        return;
      }
      const epoch = listFeedEpochRef.current;
      setLoading(true);
      try {
        const useHomePostsApi =
          tradeFeedServerResolution &&
          jobsListingKind !== "hire" &&
          jobsListingKind !== "work" &&
          !tradeTopicParam.trim();

        if (useHomePostsApi) {
          /** `/api/home/posts` 가 아니라 `/api/trade/feed` — 마켓 bootstrap·관리자 trade-expand 와 동일 id·쿼리 */
          const next = await getPostsByTradeCategoryIds([], {
            page: pageNum,
            sort,
            tradeMarketParent: categoryId,
            topic: "",
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
          } else if (next.posts.length > 0) {
            const map = await getFavoriteStatusForPosts(next.posts.map((p) => p.id));
            if (pageNum === 1) {
              setFavoriteMap(map);
            } else {
              setFavoriteMap((prev) => ({ ...prev, ...map }));
            }
          } else if (pageNum === 1) {
            setFavoriteMap({});
          }
          return;
        }

        const next = await getPostsByTradeCategoryIds(
          tradeFeedServerResolution ? [] : effectiveIds,
          {
            page: pageNum,
            sort,
            jobsListingKind,
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
        } else if (next.posts.length > 0) {
          const map = await getFavoriteStatusForPosts(next.posts.map((p) => p.id));
          if (pageNum === 1) {
            setFavoriteMap(map);
          } else {
            setFavoriteMap((prev) => ({ ...prev, ...map }));
          }
        } else if (pageNum === 1) {
          setFavoriteMap({});
        }
      } finally {
        setLoading(false);
      }
    },
    [categoryId, sort, effectiveIds, jobsListingKind, tradeFeedServerResolution, tradeTopicParam]
  );

  useEffect(() => {
    let cancelled = false;
    listFeedEpochRef.current += 1;
    const epoch = listFeedEpochRef.current;
    setPage(1);

    (async () => {
      if (initialTradeFeed && initialTradeFeed.feedKey === feedKey) {
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
              { page: 1, sort, tradeMarketParent: categoryId, topic: "" },
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
            { page: 1, sort, jobsListingKind },
            {
              posts: initialTradeFeed.posts,
              hasMore: initialTradeFeed.hasMore,
              ...(initialTradeFeed.favoriteMap !== undefined ?
                { favoriteMap: initialTradeFeed.favoriteMap }
              : {}),
            }
          );
        }
        if (initialTradeFeed.favoriteMap === undefined && initialTradeFeed.posts.length > 0) {
          const map = await getFavoriteStatusForPosts(initialTradeFeed.posts.map((p) => p.id));
          if (!cancelled && epoch === listFeedEpochRef.current) setFavoriteMap(map);
        }
        return;
      }
      await load(1);
    })();

    return () => {
      cancelled = true;
    };
  }, [feedKey, initialTradeFeed?.feedKey, load]);

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

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    load(next);
  }, [loading, hasMore, page, load]);

  const handleMenuAction = useCallback((postId: string, action: PostListMenuAction) => {
    if (action === "interest") {
      setToast("관심 있음으로 표시했어요");
      setTimeout(() => setToast(null), 2000);
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
    <div className="space-y-3">
      {posts.map((post) =>
        notInterestedPostIds.has(post.id) ? (
          <NotInterestedCard
            key={post.id}
            onUndo={() => handleUndoNotInterested(post.id)}
          />
        ) : hiddenPostIds.has(post.id) ? (
          <HiddenPostCard
            key={post.id}
            postId={post.id}
            onUndo={() => handleUndoHide(post.id)}
          />
        ) : (
          <PostCard
            key={post.id}
            post={post}
            skinKey={skinKey}
            isFavorite={favoriteMap[post.id]}
            onFavoriteChange={(postId, isFavorite) =>
              setFavoriteMap((prev) => ({ ...prev, [postId]: isFavorite }))
            }
            onMenuAction={handleMenuAction}
          />
        )
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="w-full py-3 text-[14px] text-sam-muted disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더보기"}
        </button>
      )}

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
    </div>
  );
}
