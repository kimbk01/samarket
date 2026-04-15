"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PostCard } from "@/components/post/PostCard";
import { HiddenPostCard } from "@/components/post/HiddenPostCard";
import { NotInterestedCard } from "@/components/post/NotInterestedCard";
import type { PostListMenuAction } from "@/components/post/PostListMenuBottomSheet";
import {
  getPostsForHome,
  peekCachedPostsForHome,
  primeHomePostsCache,
  type GetPostsForHomeResult,
} from "@/lib/posts/getPostsForHome";
import type { PostWithMeta } from "@/lib/posts/schema";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";

const ReportReasonModal = dynamic(
  () => import("@/components/post/ReportReasonModal").then((m) => m.ReportReasonModal),
  { loading: () => null }
);

type ListState = "idle" | "loading" | "error" | "empty";
const MIN_SILENT_REFRESH_GAP_MS = 30_000;
const HOME_POST_LIST_OPTIONS = { sort: "latest" as const, type: null };

export function HomeProductList({
  initialHomeTradeFeed,
}: {
  /** 서버(RSC)에서 채운 첫 페이지 — 마운트 시 클라이언트 재요청 생략 */
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  const { tt } = useI18n();
  const boot = initialHomeTradeFeed ?? peekCachedPostsForHome(HOME_POST_LIST_OPTIONS);
  const cachedInitial = boot;
  const [listState, setListState] = useState<ListState>(() =>
    cachedInitial ? (cachedInitial.posts.length === 0 ? "empty" : "idle") : "loading"
  );
  const [posts, setPosts] = useState<PostWithMeta[]>(() => cachedInitial?.posts ?? []);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(
    () => cachedInitial?.favoriteMap ?? {}
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastLoadedAtRef = useRef(0);

  const load = useCallback(async () => {
    await runSingleFlight("home-product-list:load", async () => {
      if (lastLoadedAtRef.current === 0) {
        setListState("loading");
      }
      try {
        const res = await getPostsForHome(HOME_POST_LIST_OPTIONS);
        setPosts(res.posts);
        setFavoriteMap(res.favoriteMap);
        lastLoadedAtRef.current = Date.now();
        setListState(res.posts.length === 0 ? "empty" : "idle");
      } catch {
        setPosts([]);
        setFavoriteMap({});
        setListState("error");
      }
    });
  }, []);

  /** RSC 시드를 페인트 전에 캐시에 넣어 같은 틱의 다른 effect·자식이 `getPostsForHome` 를 칠 때 네트워크 합류 */
  useLayoutEffect(() => {
    if (initialHomeTradeFeed) {
      primeHomePostsCache(HOME_POST_LIST_OPTIONS, initialHomeTradeFeed);
    }
    if (cachedInitial && lastLoadedAtRef.current === 0) {
      lastLoadedAtRef.current = Date.now();
    }
  }, [cachedInitial, initialHomeTradeFeed]);

  useEffect(() => {
    if (cachedInitial) return;
    queueMicrotask(() => {
      void load();
    });
  }, [cachedInitial, load]);

  const refreshSilent = useCallback(async () => {
    if (Date.now() - lastLoadedAtRef.current < MIN_SILENT_REFRESH_GAP_MS) {
      return;
    }

    await runSingleFlight("home-product-list:silent-refresh", async () => {
      try {
        const res = await getPostsForHome(HOME_POST_LIST_OPTIONS);
        setPosts(res.posts);
        setFavoriteMap(res.favoriteMap);
        lastLoadedAtRef.current = Date.now();
      } catch {
        /* 기존 목록 유지 */
      }
    });
  }, []);

  /** bfcache 복원 + 탭/앱 복귀 시 한 갈래로 갱신(디바운스) */
  useRefetchOnPageShowRestore(() => void refreshSilent(), {
    enableVisibilityRefetch: true,
    visibilityDebounceMs: 450,
  });

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

  /** 같은 탭이 보이는 채로 다른 앱(IDE 등) 갔다 올 때 — visibility 없이 focus 만 오는 경우 */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        void refreshSilent();
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (t) clearTimeout(t);
    };
  }, [refreshSilent]);

  const handleRetry = useCallback(() => {
    setListState("loading");
    void load();
  }, [load]);

  const handleMenuAction = useCallback((postId: string, action: PostListMenuAction) => {
    if (action === "interest") {
      setToast(tt("관심 있음으로 표시했어요"));
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

  const showEmpty = listState === "empty" || posts.length === 0;
  const showError = listState === "error";
  const showLoading = listState === "loading";
  const rootClass = "min-w-0 w-full max-w-full space-y-2.5";

  if (showLoading) {
    return (
      <div className={rootClass}>
        <LoadingState />
      </div>
    );
  }

  if (showError) {
    return (
      <div className={rootClass}>
        <ErrorState onRetry={handleRetry} />
      </div>
    );
  }

  if (showEmpty) {
    return (
      <div className={rootClass}>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={rootClass}>
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
            isFavorite={favoriteMap[post.id]}
            onFavoriteChange={(postId, isFavorite) =>
              setFavoriteMap((prev) => ({ ...prev, [postId]: isFavorite }))
            }
            onMenuAction={handleMenuAction}
          />
        )
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

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
      <p className="mt-3 text-[14px] text-sam-muted">로딩 중...</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-[14px] text-sam-muted">등록된 상품이 없어요</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-[14px] text-sam-muted">문제가 발생했어요</p>
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
