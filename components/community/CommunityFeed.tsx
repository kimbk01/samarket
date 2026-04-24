"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPhilifeNeighborhoodTopicOptions } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { fetchMeetingDeeplink } from "@/lib/community-messenger/home/fetch-meeting-deeplink";
import { philifeAppPaths } from "@domain/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  COMMUNITY_DROPDOWN_PANEL_CLASS,
  PHILIFE_FEED_FILTER_STRIP_CLASS,
  PHILIFE_FEED_LIST_WRAP_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { buildPhilifeComposeHref } from "@/lib/philife/compose-href";
import { CommunityCard } from "./CommunityCard";
import { AdPostCard } from "@/components/ads/AdPostCard";
import type { AdFeedPost } from "@/lib/ads/types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import { readPhilifeFeedCache, writePhilifeFeedCache } from "@/lib/community/philife-feed-session-cache";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import { getBottomNavAdjacentHref } from "@/lib/main-menu/bottom-nav-config";
import { Sam } from "@/lib/ui/sam-component-classes";
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

function isPhilifeRecommendSortCategory(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return s === "recommend" || s === "recommended";
}

function resolvePhilifeFeedSortForQuery(
  categoryRaw: string,
  sortRaw: string
): "latest" | "popular" | "recommended" {
  const c = categoryRaw.trim().toLowerCase();
  if (!c) {
    if (!sortRaw.trim()) return "latest";
    return normalizeFeedSort(sortRaw);
  }
  if (isPhilifeRecommendSortCategory(c) && !sortRaw.trim()) return "recommended";
  return normalizeFeedSort(sortRaw || undefined);
}

type PhilifeFeedTopicChip = {
  slug: string;
  label: string;
  is_feed_sort: boolean;
  sort_slot: "recommend" | "popular" | null;
};

/** 상단 첫 칩: 주제 없음(전역) — 라벨은 `최신순` / `추천순` 만 표기(“전체” 문구 없음) */
const PHILIFE_FEED_ALL_TAB_CHIP: PhilifeFeedTopicChip = {
  slug: "",
  label: "최신순",
  is_feed_sort: false,
  sort_slot: null,
};

function philifeGlobalFeedSortLabel(mode: "latest" | "recommended"): string {
  return mode === "recommended" ? "추천순" : "최신순";
}

/** 주제 미선택(전역) 칩: 최신/추천 전환(별도 `recommended` 주제 탭 없음) */
function isGlobalSortDropdownChip(c: { slug: string }): boolean {
  return c.slug === "";
}

function resolveActiveTopicTabIndex(list: PhilifeFeedTopicChip[], categoryRaw: string): number {
  if (!list.length) return 0;
  const c = categoryRaw.trim();
  if (!c || isPhilifeRecommendSortCategory(c)) {
    const g = list.findIndex((t) => t.slug === "");
    return g >= 0 ? g : 0;
  }
  const ix = list.findIndex((t) => t.slug === c);
  return ix >= 0 ? ix : 0;
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

export function CommunityFeed({
  initialGlobalFeedRsc = null,
}: {
  initialGlobalFeedRsc?: PhilifeGlobalFeedInitialRsc | null;
} = {}) {
  const { open: openPhilifeWriteSheet } = usePhilifeWriteSheet();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewerSig = usePhilifeFeedViewerSig();
  const categoryParam = searchParams.get("category")?.trim() ?? "";
  const sortParam = searchParams.get("sort")?.trim() ?? "";
  const categoryParamNorm = categoryParam.trim().toLowerCase();
  const sortForCurrentQuery = resolvePhilifeFeedSortForQuery(categoryParamNorm, sortParam);
  const canBootFromInitialGlobalFeed =
    !!initialGlobalFeedRsc &&
    initialGlobalFeedRsc.seededCategory === categoryParamNorm &&
    initialGlobalFeedRsc.seededSort === sortForCurrentQuery;
  const bootPosts = canBootFromInitialGlobalFeed
    ? mergeNeighborhoodFeedById([], initialGlobalFeedRsc?.posts ?? [], false)
    : [];
  const bootHasMore = canBootFromInitialGlobalFeed ? !!initialGlobalFeedRsc?.hasMore : false;
  const bootNextOffset =
    canBootFromInitialGlobalFeed && typeof initialGlobalFeedRsc?.nextOffset === "number"
      ? initialGlobalFeedRsc.nextOffset
      : 0;
  const [category, setCategory] = useState<string>(categoryParam);
  const [neighborOnly, setNeighborOnly] = useState(false);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>(bootPosts);
  const [hasMore, setHasMore] = useState(bootHasMore);
  const [loading, setLoading] = useState(!bootPosts.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [topAds, setTopAds] = useState<AdFeedPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(bootNextOffset);
  const loadMoreLockRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  const adsAbortRef = useRef<AbortController | null>(null);
  /** 지역·필터가 바뀌면 증가. 이전 요청 응답은 무시해 트래픽·경합 시 UI 꼬임 방지 */
  const feedSessionRef = useRef(0);
  /** 첫 페이지 fetch 만 — 세션 불일치 시에도 마지막 요청만 `loading` 해제 */
  const initialFeedLoadTokenRef = useRef(0);
  /** meetingId 딥링크 effect 중복/StrictMode 대응(항상 ref 는 다른 useEffect 앞에 선언) */
  const meetingDeepLinkSeq = useRef(0);

  const [chips, setChips] = useState<PhilifeFeedTopicChip[]>([]);
  const [recommendMenuOpen, setRecommendMenuOpen] = useState(false);
  const [recommendMenuPos, setRecommendMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const recommendMenuRef = useRef<HTMLButtonElement | null>(null);
  const recommendMenuPanelRef = useRef<HTMLUListElement | null>(null);
  const [chipsLoadDone, setChipsLoadDone] = useState(false);
  /** 주제 옵션 API: false면「관심이웃 글만 보기」띠(체크+문구) 전체 비노출. 기본 true(로드 전). */
  const [showNeighborOnlyStrip, setShowNeighborOnlyStrip] = useState(true);

  useEffect(() => {
    setCategory(categoryParam);
  }, [categoryParam]);

  /** 레거시 `?category=recommended` → `?sort=recommended` */
  useLayoutEffect(() => {
    if (!isPhilifeRecommendSortCategory(categoryParamNorm)) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (!sp.has("category")) return;
    sp.delete("category");
    if (!sp.get("sort")?.trim()) sp.set("sort", "recommended");
    const next = sp.toString();
    void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, categoryParamNorm]);

  const isAllTabView = !category.trim() || isPhilifeRecommendSortCategory(category);
  const recSortKey: "latest" | "recommended" = (() => {
    if (!isAllTabView) return "latest";
    if (!sortParam.trim()) return "latest";
    return normalizeFeedSort(sortParam) === "recommended" ? "recommended" : "latest";
  })();
  const effectiveRecSort: "latest" | "recommended" = recSortKey;

  /** 주제 칩(필리핀생활 등)일 때는 `sort` 쿼리 제거 */
  useEffect(() => {
    const cp = categoryParam.trim();
    if (!cp || isPhilifeRecommendSortCategory(cp)) return;
    if (!sortParam) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("sort");
    const next = sp.toString();
    void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [categoryParam, sortParam, pathname, router, searchParams]);

  useEffect(() => {
    if (!isAllTabView) setRecommendMenuOpen(false);
  }, [isAllTabView]);

  useEffect(() => {
    if (!recommendMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecommendMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recommendMenuOpen]);

  useEffect(() => {
    if (!recommendMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (recommendMenuRef.current?.contains(t) || recommendMenuPanelRef.current?.contains(t)) return;
      setRecommendMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [recommendMenuOpen]);

  const updateRecommendMenuPos = useCallback(() => {
    const el = recommendMenuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const menuMinW = 160;
    let left = r.left;
    if (typeof window !== "undefined") {
      const maxLeft = window.innerWidth - menuMinW - pad;
      if (left > maxLeft) left = Math.max(pad, maxLeft);
      if (left < pad) left = pad;
    }
    setRecommendMenuPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!recommendMenuOpen || !isAllTabView) {
      setRecommendMenuPos(null);
      return;
    }
    updateRecommendMenuPos();
    window.addEventListener("resize", updateRecommendMenuPos);
    document.addEventListener("scroll", updateRecommendMenuPos, true);
    return () => {
      window.removeEventListener("resize", updateRecommendMenuPos);
      document.removeEventListener("scroll", updateRecommendMenuPos, true);
    };
  }, [recommendMenuOpen, isAllTabView, updateRecommendMenuPos, chipsLoadDone]);

  /** `useSearchParams` 객체는 렌더마다 참조가 바뀔 수 있어 effect 가 무한 재실행됨 → 문자열만 의존 */
  const meetingIdParam = searchParams.get("meetingId")?.trim() ?? "";

  /** Philife `meetup` 피드는 쓰지 않음 — 모임 UX는 메신저 `open_chat` 로 보낸다(`meetingId` 딥링크는 아래 effect 가 처리). */
  useEffect(() => {
    if (categoryParam !== "meetup") return;
    if (meetingIdParam) return;
    void router.replace(philifeAppPaths.meetingsFeed, { scroll: false });
  }, [categoryParam, meetingIdParam, router]);

  useEffect(() => {
    if (!meetingIdParam) return;

    const seq = ++meetingDeepLinkSeq.current;
    const ac = new AbortController();

    const stripMeetingIdToMessenger = () => {
      void router.replace("/community-messenger?section=open_chat", { scroll: false });
    };

    void (async () => {
      try {
        const resolved = await fetchMeetingDeeplink(meetingIdParam, ac.signal);
        if (seq !== meetingDeepLinkSeq.current) return;

        if (resolved.kind === "room") {
          try {
            await fetch(
              `/api/community-messenger/rooms/${encodeURIComponent(resolved.roomId)}/meeting-ensure-participant`,
              { method: "POST", credentials: "include", signal: ac.signal }
            );
          } catch {
            /* ensure 실패해도 방 진입은 시도 */
          }
          void router.replace(`/community-messenger/rooms/${encodeURIComponent(resolved.roomId)}`);
          return;
        }
        if (resolved.kind === "post") {
          void router.replace(philifeAppPaths.post(resolved.postId));
          return;
        }
        stripMeetingIdToMessenger();
      } catch {
        if (seq !== meetingDeepLinkSeq.current || ac.signal.aborted) return;
        stripMeetingIdToMessenger();
      }
    })();

    return () => {
      ac.abort();
    };
  }, [router, meetingIdParam]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptions();
        if (cancelled) return;
        if (!cancelled) {
          setShowNeighborOnlyStrip(j?.showNeighborOnlyFilter !== false);
        }
        if (j?.ok && Array.isArray(j.feedChips)) {
          const rest: PhilifeFeedTopicChip[] = j.feedChips
            .map((x) => {
              const s = (x.slug ?? "").trim();
              const isFs = x.is_feed_sort === true;
              const sort_slot: "recommend" | "popular" | null =
                x.sort_slot === "recommend" || x.sort_slot === "popular"
                  ? x.sort_slot
                  : isFs
                    ? isPhilifeRecommendSortCategory(s)
                      ? "recommend"
                      : s.toLowerCase() === "popular"
                        ? "popular"
                        : null
                    : null;
              return {
                slug: x.slug,
                label: x.name,
                is_feed_sort: isFs,
                sort_slot,
              };
            })
            .filter((chip) => {
              const s = (chip.slug ?? "").trim().toLowerCase();
              if (isPhilifeRecommendSortCategory(s)) return false;
              if (chip.is_feed_sort && chip.sort_slot === "recommend") return false;
              return true;
            });
          const allTab = j.showAllFeedTab !== false;
          const next = allTab ? [PHILIFE_FEED_ALL_TAB_CHIP, ...rest] : rest;
          if (!cancelled) setChips(next);
          /** 전역 칩 없이 주제만 올 때 — URL/상태가 전역(빈 category)이면 첫 주제로 */
          if (!cancelled && !allTab && next.length) {
            setCategory((c) => (c === "" || !next.some((t) => t.slug === c) ? next[0]!.slug : c));
          }
        } else {
          if (!cancelled) setChips([PHILIFE_FEED_ALL_TAB_CHIP]);
        }
      } catch {
        if (!cancelled) {
          setChips([PHILIFE_FEED_ALL_TAB_CHIP]);
          setShowNeighborOnlyStrip(true);
        }
      } finally {
        if (!cancelled) setChipsLoadDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** UI에서 필터 띠를 끄면 `neighborOnly` 요청도 쓰지 않음(401·불필요 파라미터 제거). */
  useEffect(() => {
    if (showNeighborOnlyStrip) return;
    setNeighborOnly((n) => (n ? false : n));
  }, [showNeighborOnlyStrip]);

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
          category: category && !isPhilifeRecommendSortCategory(category) ? category : undefined,
          neighborOnly,
          offset: nextOffset,
          limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
          ...(isAllTabView ? { sort: recSortKey === "recommended" ? "recommended" : "latest" } : {}),
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
          writePhilifeFeedCache(
            PHILIFE_GLOBAL_FEED_SESSION_KEY,
            category,
            neighborOnly,
            viewerSig,
            {
              posts: mergedForCache,
              hasMore: !!j.hasMore,
              nextOffset: resolvedNextOffset,
            },
            recSortKey
          );
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
    [category, neighborOnly, viewerSig, recSortKey, isAllTabView]
  );

  useLayoutEffect(() => {
    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    nextOffsetRef.current = 0;
    loadMoreLockRef.current = false;

    /** RSC `전체` 시드: URL뿐 아니라 **선택한 주제 칩(state)**이 비어 있을 때만(칩만 바꾸고 URL이 안 맞는 경우가 있었음). */
    const canUseRscSeedForCurrentQuery =
      initialGlobalFeedRsc &&
      initialGlobalFeedRsc.seededCategory === category.trim().toLowerCase() &&
      initialGlobalFeedRsc.seededSort === resolvePhilifeFeedSortForQuery(category, sortParam) &&
      !neighborOnly;

    if (initialGlobalFeedRsc && canUseRscSeedForCurrentQuery && viewerSig === initialGlobalFeedRsc.viewerKey) {
      const s = initialGlobalFeedRsc;
      const merged = mergeNeighborhoodFeedById([], s.posts, false);
      setPosts(merged);
      setHasMore(s.hasMore);
      const resolvedNext = typeof s.nextOffset === "number" ? s.nextOffset : 0;
      nextOffsetRef.current = resolvedNext;
      setErr("");
      if (merged.length) {
        writePhilifeFeedCache(
          PHILIFE_GLOBAL_FEED_SESSION_KEY,
          category,
          neighborOnly,
          viewerSig,
          {
            posts: merged,
            hasMore: s.hasMore,
            nextOffset: resolvedNext,
          },
          recSortKey
        );
      }
      setLoading(false);
      return () => {
        feedAbortRef.current?.abort();
      };
    }

    const snap = readPhilifeFeedCache(
      PHILIFE_GLOBAL_FEED_SESSION_KEY,
      category,
      neighborOnly,
      viewerSig,
      recSortKey
    );
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
  }, [category, categoryParam, neighborOnly, viewerSig, recSortKey, fetchPage, initialGlobalFeedRsc]);

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
  const searchKeyForNav = searchParams.toString();
  const philifeComposeHref = buildPhilifeComposeHref(category);
  const setPhilifeRecommendSort = useCallback(
    (mode: "latest" | "recommended") => {
      const sp = new URLSearchParams(searchKeyForNav);
      sp.set("sort", mode);
      const next = sp.toString();
      void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchKeyForNav]
  );
  const applyRecommendSort = useCallback(
    (mode: "latest" | "recommended") => {
      setPhilifeRecommendSort(mode);
      setRecommendMenuOpen(false);
    },
    [setPhilifeRecommendSort]
  );

  /** 주제 탭: 상태 + `?category=` 동기화 — 새로고침·공유 시에도 동일 주제, 시드/캐시 키와도 맞음 */
  const applyCategoryTab = useCallback(
    (nextSlug: string) => {
      setCategory(nextSlug);
      const sp = new URLSearchParams(searchKeyForNav);
      const t = nextSlug.trim();
      if (t) sp.set("category", t);
      else sp.delete("category");
      const next = sp.toString();
      void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchKeyForNav]
  );

  const activeTopicTabIndex = useMemo(
    () => resolveActiveTopicTabIndex(chips, category),
    [chips, category]
  );

  const [feedSwipeOn, setFeedSwipeOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const go = () => {
      setFeedSwipeOn(mq.matches);
    };
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);

  const topicTablistRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!chipsLoadDone) return;
    const root = topicTablistRef.current;
    if (!root) return;
    const sel = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    sel?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [chipsLoadDone, activeTopicTabIndex, recSortKey, category]);

  const swipeToNextTab = useCallback(() => {
    if (!chips.length) return;
    const i = activeTopicTabIndex;
    if (i < chips.length - 1) {
      const next = chips[i + 1]!;
      applyCategoryTab(isGlobalSortDropdownChip(next) ? "" : next.slug);
      return;
    }
    const href = getBottomNavAdjacentHref("community", "next") ?? "/home";
    void router.push(href);
  }, [chips, activeTopicTabIndex, applyCategoryTab, router]);

  const swipeToPrevTab = useCallback(() => {
    if (!chips.length) return;
    const i = activeTopicTabIndex;
    if (i <= 0) return;
    const prev = chips[i - 1]!;
    applyCategoryTab(isGlobalSortDropdownChip(prev) ? "" : prev.slug);
  }, [chips, activeTopicTabIndex, applyCategoryTab]);

  const feedSwipeableRef = useRef<HTMLDivElement | null>(null);
  const canSwipeToNext = useMemo(() => chips.length > 0, [chips.length]);
  const canSwipeToPrev = useMemo(
    () => chips.length > 0 && activeTopicTabIndex > 0,
    [chips.length, activeTopicTabIndex]
  );
  const { setSwipeableEl: setFeedSwipeable } = useMobileHorizontalSwipePanel({
    enabled: feedSwipeOn,
    swipeableRef: feedSwipeableRef,
    onCommitNext: swipeToNextTab,
    onCommitPrev: swipeToPrevTab,
    canGoNext: canSwipeToNext,
    canGoPrev: canSwipeToPrev,
  });

  return (
    <div className={PHILIFE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        registerMainTier1={false}
        hideCtaStrip
        stickyBelow={
          <>
            <div className="min-w-0 overflow-x-hidden bg-sam-surface">
              <div className={APP_MAIN_HEADER_INNER_CLASS}>
                <div
                  ref={topicTablistRef}
                  className={`${Sam.tabs.barScroll} w-full max-w-full`}
                  role="tablist"
                  aria-label="피드 주제"
                >
                  {!chipsLoadDone ? (
                    <div className="flex min-h-[var(--sam-segment-tab-height)] w-full min-w-0 items-stretch border-b border-sam-border" aria-hidden>
                      <span className="min-w-16 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
                      <span className="min-w-20 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
                      <span className="min-w-14 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
                    </div>
                  ) : (
                    chips.map((c) => {
                      const on = c.slug === "" ? isAllTabView : category === c.slug;
                      const sortModeLabel =
                        c.slug === "" ? philifeGlobalFeedSortLabel(recSortKey) : c.label;
                      if (isGlobalSortDropdownChip(c)) {
                        return (
                          <div key={c.slug || "rec"} className="relative flex min-w-0 max-w-[min(12rem,45vw)] shrink-0">
                            <button
                              ref={recommendMenuRef}
                              type="button"
                              role="tab"
                              aria-selected={on}
                              aria-label={`${sortModeLabel}, 정렬 옵션`}
                              aria-haspopup="listbox"
                              aria-expanded={on && recommendMenuOpen}
                              className={`${
                                on ? Sam.tabs.tabActive : Sam.tabs.tab
                              } inline-flex w-full min-w-0 max-w-full items-center justify-center gap-0.5 px-1`}
                              onClick={() => {
                                if (category.trim() !== "") {
                                  applyCategoryTab("");
                                  setRecommendMenuOpen(false);
                                  return;
                                }
                                setRecommendMenuOpen((v) => !v);
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate px-0.5">{sortModeLabel}</span>
                              {recSortKey === "recommended" ? (
                                <ChevronUp
                                  className={`h-3.5 w-3.5 shrink-0 ${on ? "text-sam-primary" : "text-sam-muted"}`}
                                  strokeWidth={2.4}
                                  aria-hidden
                                />
                              ) : (
                                <ChevronDown
                                  className={`h-3.5 w-3.5 shrink-0 ${on ? "text-sam-primary" : "text-sam-muted"}`}
                                  strokeWidth={2.4}
                                  aria-hidden
                                />
                              )}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={c.slug || "all"}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => applyCategoryTab(c.slug === "" ? "" : c.slug)}
                          className={on ? Sam.tabs.tabActive : Sam.tabs.tab}
                        >
                          <span className="block min-w-0 max-w-[min(12rem,40vw)] truncate px-0.5">{c.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            {showNeighborOnlyStrip ? (
              <div className={PHILIFE_FEED_FILTER_STRIP_CLASS}>
                <div className={`min-w-0 space-y-1 ${APP_MAIN_HEADER_INNER_CLASS}`}>
                  <label className="flex cursor-pointer items-center gap-2 px-0 text-[14px] text-[#1F2430]">
                    <input
                      type="checkbox"
                      checked={neighborOnly}
                      onChange={(e) => setNeighborOnly(e.target.checked)}
                      className="h-4 w-4 rounded-[4px] border-[#E5E7EB] text-[#7360F2] focus:ring-[#7360F2]/30"
                    />
                    관심이웃 글만 보기
                  </label>
                  <p className="text-[13px] leading-[1.45] text-[#6B7280]">
                    글은 지역과 무관하게 모두 보이며, 상단 주제 탭으로 나눠 볼 수 있어요.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        }
      />

      {recommendMenuOpen &&
        isAllTabView &&
        recommendMenuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={recommendMenuPanelRef}
            role="listbox"
            aria-label="피드 정렬(최신순·추천순)"
            className={`min-w-[10rem] text-left ${COMMUNITY_DROPDOWN_PANEL_CLASS}`}
            style={{
              position: "fixed",
              top: recommendMenuPos.top,
              left: recommendMenuPos.left,
              zIndex: 200,
            }}
          >
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={effectiveRecSort === "latest"}
                className="block w-full px-3 py-2 text-left text-[13px] font-semibold text-[#1F2430] transition hover:bg-[#F7F8FA]"
                onClick={() => applyRecommendSort("latest")}
              >
                최신순
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={effectiveRecSort === "recommended"}
                className="block w-full px-3 py-2 text-left text-[13px] font-semibold text-[#1F2430] transition hover:bg-[#F7F8FA]"
                onClick={() => applyRecommendSort("recommended")}
              >
                추천순
              </button>
            </li>
          </ul>,
          document.body
        )}

      <div className="relative min-w-0">
        <div ref={setFeedSwipeable} className="will-change-transform touch-pan-y min-w-0">
        {loading && postsForList.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] animate-pulse bg-[#7360F2]/60"
            aria-hidden
          />
        ) : null}

        {topAds.length > 0 ? (
          <div className="space-y-1 px-2 pt-1">
            {topAds.map((ad) => (
              <AdPostCard key={ad.adId} ad={ad} />
            ))}
          </div>
        ) : null}

        {err ? (
          <div className="px-3 py-3 sm:px-4">
            <div className="rounded-[4px] border border-amber-200/90 bg-amber-50 px-4 py-3 text-[14px] text-amber-950">
              {err}
            </div>
          </div>
        ) : null}
        {loading && postsForList.length === 0 && !err ? (
          <CommunityFeedSkeleton />
        ) : !err && postsForList.length === 0 ? (
          <div className={`${APP_MAIN_GUTTER_X_CLASS} py-12 text-center text-[14px] text-[#6B7280]`}>
            아직 글이 없어요.
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {category === "meetup" ? (
                <Link href={philifeComposeHref} className="font-semibold text-[#7360F2]">
                  모임 글 쓰기
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openPhilifeWriteSheet(category)}
                  className="font-semibold text-[#7360F2] underline decoration-[#7360F2]/40 underline-offset-2"
                >
                  첫 글 쓰기
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <ul className={`${PHILIFE_FEED_LIST_WRAP_CLASS} ${topAds.length > 0 ? "mt-1" : ""}`}>
              {postsForList.map((p) => (
                <li key={p.id} className="list-none">
                  <CommunityCard post={p} />
                </li>
              ))}
            </ul>
            <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
            {loadingMore ? (
              <p className="py-4 text-center text-[13px] text-[#65676B]">더 불러오는 중…</p>
            ) : null}
            {!hasMore && postsForList.length > 0 ? (
              <p className="pb-8 pt-2 text-center text-[13px] text-[#8A8D91]">모든 글을 불러왔어요</p>
            ) : null}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
