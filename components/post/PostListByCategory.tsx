"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPostsByTradeCategoryIds,
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
import { ReportReasonModal } from "./ReportReasonModal";
import type { PostListMenuAction } from "./PostListMenuBottomSheet";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";

interface PostListByCategoryProps {
  categoryId: string;
  /** 스킨 적용용 (일반/부동산/중고차/알바/환전) */
  category?: CategoryWithSettings | null;
  sort?: PostSort;
  /** 상위+주제 OR 조회 시 id 목록. 미지정이면 categoryId만 사용 */
  filterCategoryIds?: string[];
  /** 알바 마켓: 구인/구직 메타 필터 */
  jobsListingKind?: JobListingKindFilter;
}

export function PostListByCategory({
  categoryId,
  category,
  sort = "latest",
  filterCategoryIds,
  jobsListingKind,
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

  const effectiveIds = useMemo(() => {
    if (filterCategoryIds && filterCategoryIds.length > 0) return filterCategoryIds;
    return [categoryId];
  }, [categoryId, filterCategoryIds]);

  const load = useCallback(
    async (pageNum: number = 1) => {
      if (!categoryId || effectiveIds.length === 0) return;
      setLoading(true);
      try {
        const res = await getPostsByTradeCategoryIds(effectiveIds, {
          page: pageNum,
          sort,
          jobsListingKind,
        });
        if (pageNum === 1) {
          setPosts(res.posts);
          setHiddenPostIds(new Set());
          setNotInterestedPostIds(new Set());
          if (res.posts.length > 0) {
            const map = await getFavoriteStatusForPosts(res.posts.map((p) => p.id));
            setFavoriteMap(map);
          } else {
            setFavoriteMap({});
          }
        } else {
          setPosts((prev) => [...prev, ...res.posts]);
          if (res.posts.length > 0) {
            const map = await getFavoriteStatusForPosts(res.posts.map((p) => p.id));
            setFavoriteMap((prev) => ({ ...prev, ...map }));
          }
        }
        setHasMore(res.hasMore);
      } finally {
        setLoading(false);
      }
    },
    [categoryId, sort, effectiveIds, jobsListingKind]
  );

  useEffect(() => {
    setPage(1);
    load(1);
  }, [categoryId, sort, jobsListingKind, load]);

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
      <div className="py-8 text-center text-[14px] text-gray-500">
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
          className="w-full py-3 text-[14px] text-gray-500 disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더보기"}
        </button>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gray-800 px-4 py-2 text-[14px] text-white shadow-lg">
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
