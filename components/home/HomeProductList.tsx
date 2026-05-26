"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PostCard } from "@/components/post/PostCard";
import { HiddenPostCard } from "@/components/post/HiddenPostCard";
import { NotInterestedCard } from "@/components/post/NotInterestedCard";
import type { PostListMenuAction } from "@/components/post/PostListMenuBottomSheet";
import {
  getPostsForHome,
  peekCachedPostsForHome,
  peekRecentHomePostsFallback,
  primeHomePostsCache,
  TRADE_POST_LIST_CACHE_INVALIDATED,
  type GetPostsForHomeOptions,
  type GetPostsForHomeResult,
} from "@/lib/posts/getPostsForHome";
import type { HomeTradeStateFilter } from "@/lib/posts/getPostsForHome";
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
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

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

export function HomeProductList({
  initialHomeTradeFeed,
}: {
  /** 서버(RSC)에서 채운 첫 페이지 — 마운트 시 클라이언트 재요청 생략 */
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tradeState = normalizeTradeStateFromQuery(searchParams.get("tradeState"));
  const homePostListOptions = useMemo<GetPostsForHomeOptions>(
    () => ({ sort: "latest", type: null, tradeState }),
    [tradeState]
  );
  const { tt } = useI18n();
  const hydrationSeed = getHydrationSafeBoot(tradeState, initialHomeTradeFeed);
  const [listState, setListState] = useState<ListState>(() =>
    hydrationSeed ? (hydrationSeed.posts.length === 0 ? "empty" : "idle") : "loading"
  );
  const [posts, setPosts] = useState<PostWithMeta[]>(() => hydrationSeed?.posts ?? []);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(
    () => hydrationSeed?.favoriteMap ?? {}
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [notInterestedPostIds, setNotInterestedPostIds] = useState<Set<string>>(new Set());
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastLoadedAtRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const silentRequestIdRef = useRef(0);
  /** 글 등록 직후 `router.refresh()` 등으로 RSC 시드가 늦게 와도, 클라 `load()` 결과를 덮어쓰지 않게 함 */
  const allowRscHomeListSeedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listMeasureRef = useRef<HTMLUListElement | null>(null);
  /** 시드·세션·메모리 캐시 히트면 첫 페인트부터 전체 행을 그림(8장+rAF 펼침은 콜드 네트워크 경로만) */
  const initialHasFullSeed = Boolean(hydrationSeed?.posts?.length);
  const initialVisibleExpansionDoneRef = useRef(initialHasFullSeed);
  const [visibleCount, setVisibleCount] = useState(() => {
    const initialCount = hydrationSeed?.posts.length ?? 0;
    if (initialCount <= 0) return 0;
    if (initialHasFullSeed) return initialCount;
    return Math.min(initialCount, INITIAL_VISIBLE_CARD_COUNT);
  });

  const load = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    const listOpts: GetPostsForHomeOptions = { sort: "latest", type: null, tradeState };
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
      const res = await getPostsForHome(listOpts);
      if (requestId !== latestRequestIdRef.current) return;
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
              const totalMs = Math.round(performance.now() - paintT0);
              recordAppWidePhaseLastMs("trade_list_to_paint_ms", totalMs);
              recordTradeListTotalMs(totalMs);
              sampleTradeMemoryHeapUsedMb();
            });
          });
        });
      }
    } catch {
      if (requestId !== latestRequestIdRef.current) return;
      /* 실패 시 빈 목록으로 오인하지 않음 — 직전 성공 데이터 유지 */
      setListState("error");
    } finally {
      if (requestId === latestRequestIdRef.current) {
        allowRscHomeListSeedRef.current = true;
      }
    }
  }, [tradeState]);

  /**
   * 클라이언트에서만 메모리·sessionStorage 캐시를 병합한다.
   * 첫 렌더는 `hydrationSeed`만 사용해 서버 HTML과 일치시킨다.
   */
  useLayoutEffect(() => {
    if (initialHomeTradeFeed && allowRscHomeListSeedRef.current) {
      primeHomePostsCache({ sort: "latest", type: null, tradeState }, initialHomeTradeFeed);
    }

    const boot =
      tradeState === "latest" && allowRscHomeListSeedRef.current
        ? initialHomeTradeFeed ?? peekCachedPostsForHome(homePostListOptions)
        : peekCachedPostsForHome(homePostListOptions);
    const merged = boot ?? peekRecentHomePostsFallback();

    if (merged) {
      setPosts(merged.posts);
      setFavoriteMap(merged.favoriteMap ?? {});
      setListState(merged.posts.length === 0 ? "empty" : "idle");
      lastLoadedAtRef.current = Date.now();

      const seedFull = Boolean(merged.posts?.length);
      initialVisibleExpansionDoneRef.current = seedFull;
      const ic = merged.posts.length;
      if (ic <= 0) setVisibleCount(0);
      else if (seedFull) setVisibleCount(ic);
      else setVisibleCount(Math.min(ic, INITIAL_VISIBLE_CARD_COUNT));
      return;
    }

    void load();
  }, [tradeState, initialHomeTradeFeed, load]);

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
    const requestId = ++silentRequestIdRef.current;
    try {
      const res = await getPostsForHome({ sort: "latest", type: null, tradeState });
      if (requestId !== silentRequestIdRef.current) return;
      setPosts(res.posts);
      setFavoriteMap(res.favoriteMap);
      lastLoadedAtRef.current = Date.now();
    } catch {
      if (requestId !== silentRequestIdRef.current) return;
      /* 기존 목록 유지 */
    }
  }, [tradeState]);

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
  /** 거래 전용 `<ul>` — 카드 간·리스트 상하 여백 최소(`TRADE_FEED_LIST_WRAP_CLASS`) */
  const listClass = TRADE_FEED_LIST_WRAP_CLASS;
  const visiblePosts = posts.slice(0, visibleCount > 0 ? visibleCount : posts.length);

  useLayoutEffect(() => {
    if (showLoading || showError || showEmpty) return;
    const mapItemCount =
      posts.length === 0 ? 0 : visibleCount > 0 ? Math.min(posts.length, visibleCount) : posts.length;
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
  }, [showEmpty, showError, showLoading, visibleCount, posts.length]);

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
  const { t } = useI18n();
  return (
    <ul className={TRADE_FEED_LIST_WRAP_CLASS} aria-busy="true" aria-label={t("trade_013")}>
      {[0, 1, 2, 3].map((k) => (
        <li key={k} className="rounded-ui-rect border border-sam-border/70 bg-ui-surface p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-[4px] bg-sam-border-soft sm:h-20 sm:w-20 md:h-[88px] md:w-[88px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-sam-border-soft" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-sam-border-soft/80" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-sam-border-soft/70" />
            </div>
          </div>
        </li>
      ))}
    </ul>
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
