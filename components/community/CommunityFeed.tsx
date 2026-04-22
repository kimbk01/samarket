"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchPhilifeNeighborhoodTopicOptions } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { philifeAppPaths } from "@domain/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  PHILIFE_FEED_FILTER_STRIP_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
  philifeFabComposeClass,
} from "@/lib/philife/philife-flat-ui-classes";
import { Sam } from "@/lib/ui/sam-component-classes";
import { CommunityCard } from "./CommunityCard";
import { HorizontalDragScroll } from "./HorizontalDragScroll";
import { AdPostCard } from "@/components/ads/AdPostCard";
import type { AdFeedPost } from "@/lib/ads/types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";
import { readPhilifeFeedCache, writePhilifeFeedCache } from "@/lib/community/philife-feed-session-cache";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import {
  buildPhilifeNeighborhoodFeedClientUrl,
  NEIGHBORHOOD_FEED_PAGE_SIZE,
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
} from "@/lib/philife/neighborhood-feed-client-url";
import {
  bumpAppWidePerf,
  getAppWidePhaseLastMs,
  getMessengerHomeVerificationSnapshot,
  recordAppWidePhaseLastMs,
  samarketRuntimeDebugEnabled,
  tryTrackFirstMenuListFetchStart,
  tryTrackFirstMenuListFetchSuccess,
  tryTrackFirstMenuListRender,
} from "@/lib/runtime/samarket-runtime-debug";

declare global {
  interface Window {
    /**
     * 필라이프 피드 초기 로드 분해 ms — 개발 번들에서만 채움(`NODE_ENV=development`).
     * `recordAppWidePhaseLastMs` 는 `samarket:debug:runtime=1` 일 때만 스냅샷에 들어가므로, E2E·수동은 이 객체를 우선 읽는다.
     */
    __samarketPhilifePerfLast?: Record<string, number>;
  }
}

function setPhilifePerfMirrorDev(partial: Record<string, number>): void {
  if (typeof window === "undefined") return;
  /** 개발 빌드 또는 런타임 디버그 켜짐 — E2E(sessionStorage) 만 켠 경우에도 미러 채움 */
  if (process.env.NODE_ENV !== "development" && !samarketRuntimeDebugEnabled()) return;
  window.__samarketPhilifePerfLast = { ...(window.__samarketPhilifePerfLast ?? {}), ...partial };
}

function philifePerfDiagEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    window.location.pathname === "/philife"
  );
}

function philifePerfDiag(event: string, extra: Record<string, unknown>): void {
  if (!philifePerfDiagEnabled() || typeof console.debug !== "function") return;
  console.debug(`[community-feed:perf-diag] ${event}`, extra);
}

function philifeDiagSnapshot(tag: string): void {
  if (!philifePerfDiagEnabled()) return;
  const raw = globalThis as unknown as { __samarketAppWidePhaseLastMs?: Record<string, number> };
  const snap = getMessengerHomeVerificationSnapshot();
  philifePerfDiag(`snapshot_${tag}`, {
    rawGlobalPhaseKeys: Object.keys(raw.__samarketAppWidePhaseLastMs ?? {}),
    snapPhaseKeys: Object.keys(snap.appWidePhaseLastMs ?? {}),
    getAppWidePhaseLastMsKeys: Object.keys(getAppWidePhaseLastMs()),
  });
}

function recordPhilifeCommunityPhase(key: string, ms: number, isInitialPage: boolean): void {
  if (!isInitialPage) return;
  philifePerfDiag("phase_before_record", { key, ms, willCallRecordAppWidePhaseLastMs: true });
  recordAppWidePhaseLastMs(key, ms);
}

function mergeNeighborhoodFeedById(
  prev: NeighborhoodFeedPostDTO[],
  incoming: NeighborhoodFeedPostDTO[],
  append: boolean
): NeighborhoodFeedPostDTO[] {
  if (!append) {
    const seen = new Set<string>();
    const out: NeighborhoodFeedPostDTO[] = [];
    for (const p of incoming) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }
  const seen = new Set(prev.map((p) => p.id));
  const out = [...prev];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function dedupeNeighborhoodFeedById(list: NeighborhoodFeedPostDTO[]): NeighborhoodFeedPostDTO[] {
  const seen = new Set<string>();
  const out: NeighborhoodFeedPostDTO[] = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function CommunityFeed() {
  const viewerSig = usePhilifeFeedViewerSig();
  const [category, setCategory] = useState<string>("");
  const [neighborOnly, setNeighborOnly] = useState(false);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [topAds, setTopAds] = useState<AdFeedPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  const adsAbortRef = useRef<AbortController | null>(null);
  /** 지역·필터가 바뀌면 증가. 이전 요청 응답은 무시해 트래픽·경합 시 UI 꼬임 방지 */
  const feedSessionRef = useRef(0);
  /** 첫 페이지 fetch 만 — 세션 불일치 시에도 마지막 요청만 `loading` 해제 */
  const initialFeedLoadTokenRef = useRef(0);

  const [chips, setChips] = useState<{ slug: string; label: string }[]>(() => [{ slug: "", label: "전체" }]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptions();
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.feedChips)) {
          setChips([{ slug: "", label: "전체" }, ...j.feedChips.map((x) => ({ slug: x.slug, label: x.name }))]);
        } else {
          setChips([{ slug: "", label: "전체" }]);
        }
      } catch {
        if (!cancelled) setChips([{ slug: "", label: "전체" }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean, session: number) => {
      let initialLoadToken = 0;
      if (append) setLoadingMore(true);
      else {
        initialLoadToken = ++initialFeedLoadTokenRef.current;
        setLoading(true);
        setErr("");
      }
      feedAbortRef.current?.abort();
      const controller = new AbortController();
      feedAbortRef.current = controller;
      const timeoutId =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              controller.abort();
            }, 28_000)
          : undefined;
      const isInitialPage = !append && nextOffset === 0;
      let communityFetchT0 = 0;
      if (isInitialPage) {
        philifePerfDiag("fetchPage_enter", {
          append,
          nextOffset,
          isInitialPage,
          session,
          runtimeDebugFlag: samarketRuntimeDebugEnabled(),
        });
        tryTrackFirstMenuListFetchStart();
        bumpAppWidePerf("community_list_fetch_start");
        communityFetchT0 = performance.now();
      }
      try {
        const url = buildPhilifeNeighborhoodFeedClientUrl({
          globalFeed: true,
          category: category || undefined,
          neighborOnly,
          offset: nextOffset,
          limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
        });
        const personalized = neighborOnly || viewerSig !== "_anon";
        const tFetchStart = performance.now();
        const res = await fetch(url, {
          credentials: "include",
          signal: controller.signal,
          priority: "high",
          ...(personalized ? { cache: "no-store" as RequestCache } : {}),
        });
        const tAfterNetwork = performance.now();
        if (isInitialPage) {
          philifeDiagSnapshot("before_first_community_record");
          recordPhilifeCommunityPhase(
            "community_list_fetch_network_ms",
            Math.round(tAfterNetwork - tFetchStart),
            isInitialPage
          );
        }
        let j: {
          ok?: boolean;
          posts?: NeighborhoodFeedPostDTO[];
          hasMore?: boolean;
          error?: string;
          nextOffset?: number | null;
          dbPageLength?: number;
        };
        let jsonParseMs = 0;
        try {
          const tJson0 = performance.now();
          j = (await res.json()) as typeof j;
          jsonParseMs = Math.round(performance.now() - tJson0);
          if (isInitialPage) {
            recordPhilifeCommunityPhase("community_list_fetch_json_ms", jsonParseMs, isInitialPage);
          }
        } catch {
          if (session !== feedSessionRef.current) return;
          setErr("응답을 해석하지 못했습니다.");
          /* fetch 실패 ≠ 빈 피드 — 세션 캐시·직전 목록 유지 */
          setHasMore(false);
          return;
        }
        if (session !== feedSessionRef.current) return;
        if (res.status === 401 && neighborOnly) {
          setErr("관심이웃 필터는 로그인 후 사용할 수 있어요.");
          setNeighborOnly(false);
          setLoadingMore(false);
          if (!append) setLoading(false);
          return;
        }
        if (!res.ok || !j.ok) {
          const code = j.error ?? "";
          if (code === "invalid_category") {
            setCategory("");
          }
          const human =
            code === "invalid_category"
              ? "선택한 주제가 더 이상 사용되지 않아요. 상단 주제를 다시 선택해 주세요."
              : code === "server_config"
                ? "서버 설정을 확인할 수 없습니다."
                : (j.error ?? "피드를 불러오지 못했습니다.");
          setErr(human);
          setHasMore(false);
          return;
        }
        const next = j.posts ?? [];
        const tMerge0 = performance.now();
        let mergedForCache: NeighborhoodFeedPostDTO[] | null = null;
        if (!append) {
          mergedForCache = mergeNeighborhoodFeedById([], next, false);
          setPosts(mergedForCache);
        } else {
          setPosts((prev) => mergeNeighborhoodFeedById(prev, next, true));
        }
        const mergeMs = Math.round(performance.now() - tMerge0);
        if (isInitialPage) {
          recordPhilifeCommunityPhase("community_list_merge_ms", mergeMs, isInitialPage);
        }
        const tAfterMerge = performance.now();
        setHasMore(!!j.hasMore);
        const advance =
          typeof j.dbPageLength === "number" ? j.dbPageLength : next.length;
        const resolvedNextOffset =
          typeof j.nextOffset === "number" ? j.nextOffset : nextOffset + advance;
        nextOffsetRef.current = resolvedNextOffset;

        if (!append && session === feedSessionRef.current && mergedForCache && mergedForCache.length > 0) {
          writePhilifeFeedCache(PHILIFE_GLOBAL_FEED_SESSION_KEY, category, neighborOnly, viewerSig, {
            posts: mergedForCache,
            hasMore: !!j.hasMore,
            nextOffset: resolvedNextOffset,
          });
        }
        if (isInitialPage) {
          const renderPrepareMs = Math.round(performance.now() - tAfterMerge);
          recordPhilifeCommunityPhase("community_list_render_prepare_ms", renderPrepareMs, isInitialPage);
          bumpAppWidePerf("community_list_fetch_success");
          const tWall = performance.now();
          const wallMs = Math.round(tWall - communityFetchT0);
          recordPhilifeCommunityPhase("community_list_fetch_ms", wallMs, isInitialPage);
          tryTrackFirstMenuListFetchSuccess();
          bumpAppWidePerf("community_list_render");
          tryTrackFirstMenuListRender();
          {
            const networkMs = Math.round(tAfterNetwork - tFetchStart);
            const mirrorPartial = {
              community_list_fetch_network_ms: networkMs,
              community_list_fetch_json_ms: jsonParseMs,
              community_list_merge_ms: mergeMs,
              community_list_render_prepare_ms: renderPrepareMs,
              community_list_fetch_ms: wallMs,
            };
            philifePerfDiag("before_mirror_window", {
              partialKeys: Object.keys(mirrorPartial),
              prevMirrorKeys: Object.keys(window.__samarketPhilifePerfLast ?? {}),
            });
            setPhilifePerfMirrorDev(mirrorPartial);
            philifePerfDiag("after_mirror_window", {
              mirrorKeys: Object.keys(window.__samarketPhilifePerfLast ?? {}),
            });
            philifeDiagSnapshot("after_mirror_batch");
          }
          const paintT0 = communityFetchT0;
          const rafStart = tWall;
          queueMicrotask(() => {
            if (typeof requestAnimationFrame !== "function") return;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const tPaint = performance.now();
                const toPaint = Math.round(tPaint - paintT0);
                const paintRaf = Math.round(tPaint - rafStart);
                recordPhilifeCommunityPhase("community_list_to_paint_ms", toPaint, true);
                recordPhilifeCommunityPhase("community_list_paint_raf_ms", paintRaf, true);
                philifePerfDiag("before_mirror_window_paint", {
                  partialKeys: ["community_list_to_paint_ms", "community_list_paint_raf_ms"],
                  prevMirrorKeys: Object.keys(window.__samarketPhilifePerfLast ?? {}),
                });
                setPhilifePerfMirrorDev({
                  community_list_to_paint_ms: toPaint,
                  community_list_paint_raf_ms: paintRaf,
                });
                philifePerfDiag("after_mirror_window_paint", {
                  mirrorKeys: Object.keys(window.__samarketPhilifePerfLast ?? {}),
                });
                philifeDiagSnapshot("after_paint_mirror");
              });
            });
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (session !== feedSessionRef.current) return;
        setHasMore(false);
        setErr("피드를 불러오지 못했습니다.");
      } finally {
        if (typeof timeoutId === "number") window.clearTimeout(timeoutId);
        if (feedAbortRef.current === controller) {
          feedAbortRef.current = null;
        }
        if (append) {
          setLoadingMore(false);
        } else if (initialLoadToken === initialFeedLoadTokenRef.current) {
          setLoading(false);
        }
      }
    },
    [category, neighborOnly, viewerSig]
  );

  useLayoutEffect(() => {
    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    nextOffsetRef.current = 0;
    loadMoreLockRef.current = false;

    const snap = readPhilifeFeedCache(PHILIFE_GLOBAL_FEED_SESSION_KEY, category, neighborOnly, viewerSig);
    if (snap?.posts?.length) {
      setPosts(dedupeNeighborhoodFeedById(snap.posts));
      setHasMore(snap.hasMore);
      nextOffsetRef.current = snap.nextOffset;
      setErr("");
    } else {
      setPosts([]);
      setErr("");
    }

    void fetchPage(0, false, session);
    return () => {
      feedAbortRef.current?.abort();
    };
  }, [category, neighborOnly, viewerSig, fetchPage]);

  // 상단 광고: 피드·주제 칩 이후 유휴 시 로드 (첫 페인트·메인 fetch와 경합 완화)
  useEffect(() => {
    adsAbortRef.current?.abort();
    const controller = new AbortController();
    adsAbortRef.current = controller;
    const load = () => {
      fetch("/api/ads/active?boardKey=plife", { signal: controller.signal })
        .then((r) => r.json())
        .then((j: { ads?: AdFeedPost[] }) => {
          if (j.ads) setTopAds(j.ads);
        })
        .catch(() => {
          /* 광고 로드 실패는 조용히 무시 */
        });
    };
    const ric = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    const cancelRic = globalThis.cancelIdleCallback;
    let cancelScheduled: (() => void) | undefined;
    if (typeof ric === "function") {
      const idleId = ric(load, { timeout: 2800 });
      cancelScheduled = () => {
        if (typeof cancelRic === "function") cancelRic(idleId);
      };
    } else {
      const tid = window.setTimeout(load, 120);
      cancelScheduled = () => window.clearTimeout(tid);
    }
    return () => {
      cancelScheduled?.();
      controller.abort();
      if (adsAbortRef.current === controller) {
        adsAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadMoreLockRef.current) return;
        loadMoreLockRef.current = true;
        const start = nextOffsetRef.current;
        const liveSession = feedSessionRef.current;
        void fetchPage(start, true, liveSession).finally(() => {
          loadMoreLockRef.current = false;
        });
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, fetchPage]);

  const postsForList = posts;

  return (
    <div className={PHILIFE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        registerMainTier1={false}
        hideCtaStrip
        stickyBelow={
          <>
            <div className="min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface-muted">
              <div className={APP_MAIN_HEADER_INNER_CLASS}>
                <HorizontalDragScroll
                  className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
                  style={{ WebkitOverflowScrolling: "touch" }}
                  role="tablist"
                  aria-label="피드 주제"
                >
                  {chips.map((c) => {
                    const on = category === c.slug || (c.slug === "" && category === "");
                    return (
                      <button
                        key={c.slug || "all"}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setCategory(c.slug === "" ? "" : c.slug)}
                        className={on ? Sam.tabs.tabActive : Sam.tabs.tab}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </HorizontalDragScroll>
              </div>
            </div>
            <div className={PHILIFE_FEED_FILTER_STRIP_CLASS}>
              <div className={`min-w-0 space-y-1 ${APP_MAIN_HEADER_INNER_CLASS}`}>
                <label className="sam-text-helper flex cursor-pointer items-center gap-2 px-0 text-sam-muted">
                  <input
                    type="checkbox"
                    checked={neighborOnly}
                    onChange={(e) => setNeighborOnly(e.target.checked)}
                    className="rounded border-sam-border"
                  />
                  관심이웃 글만 보기
                </label>
                <p className="sam-text-xxs leading-snug text-sam-meta">
                  글은 지역과 무관하게 모두 보이며, 상단 주제 탭으로 나눠 볼 수 있어요.
                </p>
              </div>
            </div>
          </>
        }
      />

      <div className="relative min-w-0">
        {loading && postsForList.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] animate-pulse bg-signature/50"
            aria-hidden
          />
        ) : null}

        {topAds.length > 0 ? topAds.map((ad) => <AdPostCard key={ad.adId} ad={ad} />) : null}

        {err ? (
          <div className="px-3 py-3 sm:px-4">
            <div className={`rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sam-text-body`}>
              {err}
            </div>
          </div>
        ) : null}
        {loading && postsForList.length === 0 ? (
          <CommunityFeedSkeleton />
        ) : !err && postsForList.length === 0 ? (
          <div className={`${APP_MAIN_GUTTER_X_CLASS} py-12 text-center text-sam-muted sam-text-body`}>
            아직 글이 없어요.
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link
                href={category === "meetup" ? philifeAppPaths.writeMeeting : philifeAppPaths.write}
                className="font-semibold text-signature"
              >
                {category === "meetup" ? "모임 글 쓰기" : "첫 글 쓰기"}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul
              className={`m-0 list-none divide-y divide-sam-border p-0 ${APP_MAIN_GUTTER_X_CLASS} pt-2 pb-1 ${topAds.length > 0 ? "mt-2" : ""}`}
            >
              {postsForList.map((p) => (
                <li key={p.id} className="list-none">
                  <CommunityCard post={p} />
                </li>
              ))}
            </ul>
            <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
            {loadingMore ? <p className="py-4 text-center sam-text-body-secondary text-sam-meta">더 불러오는 중…</p> : null}
            {!hasMore && postsForList.length > 0 ? (
              <p className="pb-8 pt-2 text-center sam-text-helper text-sam-meta">모든 글을 불러왔어요</p>
            ) : null}
          </>
        )}
      </div>

      <Link
        href={category === "meetup" ? philifeAppPaths.writeMeeting : philifeAppPaths.write}
        className={philifeFabComposeClass()}
        aria-label={category === "meetup" ? "모임 글쓰기" : "커뮤니티 글쓰기"}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  );
}
