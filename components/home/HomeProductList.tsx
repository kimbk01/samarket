"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import type { HomeTradeStateFilter } from "@/lib/posts/getPostsForHome";
import type { PostWithMeta } from "@/lib/posts/schema";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
  tryTrackFirstMenuListFetchStart,
  tryTrackFirstMenuListFetchSuccess,
  tryTrackFirstMenuListRender,
} from "@/lib/runtime/samarket-runtime-debug";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import { PHILIFE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";

const ReportReasonModal = dynamic(
  () => import("@/components/post/ReportReasonModal").then((m) => m.ReportReasonModal),
  { loading: () => null }
);

type ListState = "idle" | "loading" | "error" | "empty";
const MIN_SILENT_REFRESH_GAP_MS = 30_000;
function normalizeTradeStateFromQuery(raw: string | null): HomeTradeStateFilter {
  if (raw === "active" || raw === "reserved" || raw === "sold") return raw;
  return "latest";
}

const INITIAL_VISIBLE_CARD_COUNT = 8;

export function HomeProductList({
  initialHomeTradeFeed,
}: {
  /** 서버(RSC)에서 채운 첫 페이지 — 마운트 시 클라이언트 재요청 생략 */
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  const searchParams = useSearchParams();
  const tradeState = normalizeTradeStateFromQuery(searchParams.get("tradeState"));
  const HOME_POST_LIST_OPTIONS = { sort: "latest" as const, type: null, tradeState };
  const { tt } = useI18n();
  const boot =
    tradeState === "latest"
      ? initialHomeTradeFeed ?? peekCachedPostsForHome(HOME_POST_LIST_OPTIONS)
      : peekCachedPostsForHome(HOME_POST_LIST_OPTIONS);
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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listMeasureRef = useRef<HTMLUListElement | null>(null);
  const initialVisibleExpansionDoneRef = useRef(false);
  const [visibleCount, setVisibleCount] = useState(() => {
    const initialCount = cachedInitial?.posts.length ?? 0;
    return initialCount > 0 ? Math.min(initialCount, INITIAL_VISIBLE_CARD_COUNT) : 0;
  });

  const load = useCallback(async () => {
    await runSingleFlight("home-product-list:load", async () => {
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
        const res = await getPostsForHome(HOME_POST_LIST_OPTIONS);
        setPosts(res.posts);
        setFavoriteMap(res.favoriteMap);
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
            if (typeof requestAnimationFrame !== "function") return;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                recordAppWidePhaseLastMs("trade_list_to_paint_ms", Math.round(performance.now() - paintT0));
              });
            });
          });
        }
      } catch {
        /* 실패 시 빈 목록으로 오인하지 않음 — 직전 성공 데이터 유지 */
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

  useLayoutEffect(() => {
    if (cachedInitial) return;
    void load();
  }, [cachedInitial, load]);

  useEffect(() => {
    if (posts.length <= 0) {
      initialVisibleExpansionDoneRef.current = false;
      setVisibleCount(0);
      return;
    }
    if (initialVisibleExpansionDoneRef.current) {
      setVisibleCount(posts.length);
      return;
    }
    const initialVisibleCount = Math.min(posts.length, INITIAL_VISIBLE_CARD_COUNT);
    setVisibleCount(initialVisibleCount);
    if (posts.length <= initialVisibleCount) {
      initialVisibleExpansionDoneRef.current = true;
      return;
    }
    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      initialVisibleExpansionDoneRef.current = true;
      setVisibleCount(posts.length);
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [posts.length]);

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

  /** bfcache 복원 + 탭/앱 복귀 + 포커스만 바뀌는 복귀 — 한 훅·동일 디바운스 정책 */
  useRefetchOnPageShowRestore(() => void refreshSilent(), {
    enableVisibilityRefetch: true,
    visibilityDebounceMs: 450,
    enableWindowFocusRefetch: true,
    windowFocusDebounceMs: 400,
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

  const showEmpty = listState === "empty" || posts.length === 0;
  const showError = listState === "error";
  const showLoading = listState === "loading";
  const rootClass = "min-w-0 w-full max-w-full";
  /** `/philife` 피드 `<ul>`과 동일 — 가로 `px-2` 한 겹(부모 `HomeContent`는 가로 패딩 없음) */
  const listClass = PHILIFE_FEED_LIST_WRAP_CLASS;
  const visiblePosts = posts.slice(0, visibleCount > 0 ? visibleCount : posts.length);

  if (!showLoading && !showError && !showEmpty) {
    recordTradeListMetricOnce("trade_list_product_list_render_start_ms");
    recordTradeListMetricOnce("trade_list_first_render_map_item_count", visiblePosts.length);
  }

  useLayoutEffect(() => {
    if (showLoading || showError || showEmpty) return;
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
  }, [showEmpty, showError, showLoading, visiblePosts.length]);

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
    <>
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
            <li key={post.id} className="min-w-0">
              <PostCard
                post={post}
                isFirstCard={index === 0}
                isFavorite={favoriteMap[post.id]}
                onFavoriteChange={handleFavoriteChange}
                onMenuAction={handleMenuAction}
              />
            </li>
          )
        )}
      </ul>

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
