"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchPhilifeNeighborhoodTopicOptions,
  peekPhilifeNeighborhoodTopicOptionsFromCache,
  seedPhilifeNeighborhoodTopicOptionsCache,
} from "@/lib/philife/fetch-neighborhood-topic-options-client";
import {
  buildFeedChipsFromPhilifeTopicOptionsJson,
  isPhilifeRecommendSortCategory,
  type PhilifeFeedTopicChip,
  PHILIFE_FEED_ALL_TAB_CHIP,
} from "@/lib/philife/philife-feed-chips-from-topic-options";
import { fetchMeetingDeeplink } from "@/lib/community-messenger/home/fetch-meeting-deeplink";
import { philifeAppPaths } from "@domain/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  COMMUNITY_DROPDOWN_PANEL_CLASS,
  PHILIFE_FEED_FILTER_STRIP_CLASS,
  PHILIFE_FEED_LIST_WRAP_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
  PHILIFE_TOPIC_TAB_PILL_ACTIVE,
  PHILIFE_TOPIC_TAB_ROW_CLASS,
  PHILIFE_TOPIC_TAB_SUBJECT_ACTIVE,
  PHILIFE_TOPIC_TAB_SUBJECT_IDLE,
} from "@/lib/philife/philife-flat-ui-classes";
import { buildPhilifeComposeHref } from "@/lib/philife/compose-href";
import { CommunityCard } from "./CommunityCard";
import { AdPostCard } from "@/components/ads/AdPostCard";
import type { AdFeedPost } from "@/lib/ads/types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import { readPhilifeFeedCache, writePhilifeFeedCache, philifeFeedViewerSig } from "@/lib/community/philife-feed-session-cache";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import { getBottomNavAdjacentHref } from "@/lib/main-menu/bottom-nav-config";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { useLongPressOrTap } from "@/lib/ui/use-long-press-or-tap";
import {
  buildPhilifeNeighborhoodFeedClientUrl,
  NEIGHBORHOOD_FEED_PAGE_SIZE,
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
} from "@/lib/philife/neighborhood-feed-client-url";
import { runSingleFlight } from "@/lib/http/run-single-flight";
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
import { menuHrefMatchesIntent, useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";

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

function philifeGlobalFeedSortLabel(mode: "latest" | "recommended"): string {
  return mode === "recommended" ? "추천순" : "최신순";
}

/** 주제 미선택(전역) 칩: 최신/추천 전환(별도 `recommended` 주제 탭 없음) */
function isGlobalSortDropdownChip(c: { slug: string }): boolean {
  return c.slug === "";
}

function resolveActiveTopicTabIndex(list: PhilifeFeedTopicChip[], categoryRaw: string): number {
  if (!list.length) return 0;
  const c = categoryRaw.trim().toLowerCase();
  if (!c || isPhilifeRecommendSortCategory(c)) {
    const g = list.findIndex((t) => t.slug === "");
    return g >= 0 ? g : 0;
  }
  const ix = list.findIndex((t) => (t.slug ?? "").trim().toLowerCase() === c);
  return ix >= 0 ? ix : 0;
}

/**
 * `scrollLeft === 0`일 때 뷰 안에 **완전히** 들어오는 마지막 탭 인덱스까지 = **홈 범위**(최신순~질문있어요 등).
 * - 그 범위의 탭을 고르면 **`scrollLeft = 0`** 으로 복귀(앞으로 밀렸던 줄이 원위치).
 * - 그보다 오른쪽 탭만: 오른쪽 잘림 → 한 단계 전진 + peel; 왼쪽 잘림 → 대칭 후퇴 대신 **선택 탭이 왼쪽에 오도록** `scrollLeft`만 맞춤.
 */
function scrollPhilifeTopicTabStrip(
  root: HTMLElement,
  sel: HTMLElement,
  activeIndex: number,
  padPx: number
): void {
  const max = Math.max(0, root.scrollWidth - root.clientWidth);
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
  if (!tabs.length) return;

  const boundary = root.clientWidth - padPx * 2;
  let maxVisibleAtHome = -1;
  for (let i = 0; i < tabs.length; i += 1) {
    const el = tabs[i]!;
    const right = el.offsetLeft + el.offsetWidth;
    if (right <= boundary + 10) maxVisibleAtHome = i;
    else break;
  }
  if (maxVisibleAtHome < 0) maxVisibleAtHome = 0;

  if (activeIndex <= maxVisibleAtHome) {
    if (max > 0) root.scrollTo({ left: 0, behavior: "auto" });
    return;
  }

  if (max <= 0) return;

  const rootRect = root.getBoundingClientRect();
  const selRect = sel.getBoundingClientRect();
  const lo = rootRect.left + padPx;
  const hi = rootRect.right - padPx;

  if (selRect.left >= lo - 0.5 && selRect.right <= hi + 0.5) return;

  if (selRect.right > hi + 0.5) {
    let sl = root.scrollLeft;
    const peel = selRect.right - hi + 6;
    const step = Math.min(max - sl, Math.max(peel, root.clientWidth * 0.68));
    sl = Math.min(max, sl + step);
    root.scrollTo({ left: sl, behavior: "auto" });
    const rr = root.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    if (sr.right > rr.right - padPx - 0.5) {
      root.scrollTo({
        left: Math.min(max, root.scrollLeft + (sr.right - (rr.right - padPx) + 4)),
        behavior: "auto",
      });
    }
    return;
  }

  if (selRect.left < lo - 0.5) {
    let x = 0;
    let n: HTMLElement | null = sel;
    while (n && n !== root) {
      x += n.offsetLeft;
      n = n.offsetParent as HTMLElement | null;
    }
    let target: number;
    if (n === root) {
      target = Math.max(0, Math.min(max, x - padPx));
    } else {
      target = Math.max(0, Math.min(max, root.scrollLeft + (selRect.left - rootRect.left) - padPx));
    }
    root.scrollTo({ left: target, behavior: "auto" });
    const rr = root.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    if (sr.left < rr.left + padPx - 0.5) {
      root.scrollTo({
        left: Math.max(0, root.scrollLeft - (rr.left + padPx - sr.left + 4)),
        behavior: "auto",
      });
    }
  }
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

function isSameNeighborhoodFeedRows(
  prev: NeighborhoodFeedPostDTO[],
  next: NeighborhoodFeedPostDTO[]
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i] as NeighborhoodFeedPostDTO & {
      updated_at?: string;
      created_at?: string;
      content?: string;
    };
    const b = next[i] as NeighborhoodFeedPostDTO & {
      updated_at?: string;
      created_at?: string;
      content?: string;
    };
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if ((a.updated_at ?? "") !== (b.updated_at ?? "")) return false;
    if ((a.created_at ?? "") !== (b.created_at ?? "")) return false;
    if ((a.content ?? "") !== (b.content ?? "")) return false;
  }
  return true;
}

export function CommunityFeed({
  initialGlobalFeedRsc = null,
}: {
  initialGlobalFeedRsc?: PhilifeGlobalFeedInitialRsc | null;
} = {}) {
  const { open: openPhilifeWriteSheet } = usePhilifeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const router = useRouter();
  const pathname = usePathname();
  const { beginMenuNavigation, pendingMenuIntent } = useLatestMenuNavigation();
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
  const recSortKeyForBoot = categoryParamNorm ? "" : sortForCurrentQuery;
  const sessionSnapBoot = !canBootFromInitialGlobalFeed
    ? readPhilifeFeedCache(
        PHILIFE_GLOBAL_FEED_SESSION_KEY,
        categoryParamNorm,
        false,
        typeof window !== "undefined" ? philifeFeedViewerSig() : "_anon",
        recSortKeyForBoot
      )
    : null;
  const bootPosts = canBootFromInitialGlobalFeed
    ? mergeNeighborhoodFeedById([], initialGlobalFeedRsc?.posts ?? [], false)
    : sessionSnapBoot?.posts?.length
      ? dedupeNeighborhoodFeedById(sessionSnapBoot.posts)
      : [];
  const bootHasMore = canBootFromInitialGlobalFeed
    ? !!initialGlobalFeedRsc?.hasMore
    : sessionSnapBoot?.hasMore ?? false;
  const bootNextOffset =
    canBootFromInitialGlobalFeed && typeof initialGlobalFeedRsc?.nextOffset === "number"
      ? initialGlobalFeedRsc.nextOffset
      : typeof sessionSnapBoot?.nextOffset === "number"
        ? sessionSnapBoot.nextOffset
        : 0;
  const [category, setCategory] = useState<string>(categoryParam);
  const [neighborOnly, setNeighborOnly] = useState(false);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>(bootPosts);
  const [hasMore, setHasMore] = useState(bootHasMore);
  const [loading, setLoading] = useState(!bootPosts.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const postsRef = useRef<NeighborhoodFeedPostDTO[]>(bootPosts);
  const adjacentPrefetchAtRef = useRef<Record<string, number>>({});
  const initialPrewarmDoneRef = useRef(false);
  const listRootRef = useRef<HTMLUListElement | null>(null);
  const firstCardPaintStartRef = useRef(0);
  const firstCardPaintQueryKeyRef = useRef("");
  const [err, setErr] = useState("");
  const [topAds, setTopAds] = useState<AdFeedPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(bootNextOffset);
  const loadMoreLockRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  /** 지역·필터가 바뀌면 증가. 이전 요청 응답은 무시해 트래픽·경합 시 UI 꼬임 방지 */
  const feedSessionRef = useRef(0);
  /** 첫 페이지 fetch 만 — 세션 불일치 시에도 마지막 요청만 `loading` 해제 */
  const initialFeedLoadTokenRef = useRef(0);
  /** meetingId 딥링크 effect 중복/StrictMode 대응(항상 ref 는 다른 useEffect 앞에 선언) */
  const meetingDeepLinkSeq = useRef(0);
  /** 2단 탭 가로 스크롤 정렬 — StrictMode 이펙트 재실행 시 stale rAF 무시 */
  const topicTabScrollGenRef = useRef(0);

  const [chips, setChips] = useState<PhilifeFeedTopicChip[]>(() => {
    const peeked = peekPhilifeNeighborhoodTopicOptionsFromCache();
    if (peeked) return buildFeedChipsFromPhilifeTopicOptionsJson(peeked).chips;
    const seed = initialGlobalFeedRsc?.topicOptionsSeed;
    if (seed) {
      seedPhilifeNeighborhoodTopicOptionsCache(seed);
      return buildFeedChipsFromPhilifeTopicOptionsJson(seed).chips;
    }
    return [];
  });
  const [recommendMenuOpen, setRecommendMenuOpen] = useState(false);
  const [recommendMenuPos, setRecommendMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const recommendMenuRef = useRef<HTMLButtonElement | null>(null);
  const recommendMenuPanelRef = useRef<HTMLUListElement | null>(null);
  const [chipsLoadDone, setChipsLoadDone] = useState(
    () =>
      Boolean(peekPhilifeNeighborhoodTopicOptionsFromCache()) ||
      Boolean(initialGlobalFeedRsc?.topicOptionsSeed)
  );
  /** 주제 옵션 API: false면「관심이웃 글만 보기」띠(체크+문구) 전체 비노출. */
  const [showNeighborOnlyStrip, setShowNeighborOnlyStrip] = useState(() => {
    const peeked = peekPhilifeNeighborhoodTopicOptionsFromCache();
    if (peeked) return peeked.showNeighborOnlyFilter !== false;
    const seed = initialGlobalFeedRsc?.topicOptionsSeed;
    if (seed) return seed.showNeighborOnlyFilter !== false;
    return true;
  });

  useEffect(() => {
    setCategory((prev) => (prev === categoryParam ? prev : categoryParam));
  }, [categoryParam]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

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
  const latestSortHref = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("sort", "latest");
    const next = sp.toString();
    return next ? `${pathname}?${next}` : pathname;
  })();
  const recommendedSortHref = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("sort", "recommended");
    const next = sp.toString();
    return next ? `${pathname}?${next}` : pathname;
  })();
  const recSortKey: "latest" | "recommended" = (() => {
    if (!isAllTabView) return "latest";
    if (!sortParam.trim()) return "latest";
    return normalizeFeedSort(sortParam) === "recommended" ? "recommended" : "latest";
  })();
  const effectiveRecSort: "latest" | "recommended" = menuHrefMatchesIntent(recommendedSortHref, pendingMenuIntent)
    ? "recommended"
    : menuHrefMatchesIntent(latestSortHref, pendingMenuIntent)
      ? "latest"
      : recSortKey;

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
    if (!isAllTabView) setRecommendMenuOpen((prev) => (prev ? false : prev));
  }, [isAllTabView]);

  useEffect(() => {
    if (!recommendMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecommendMenuOpen((prev) => (prev ? false : prev));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [recommendMenuOpen]);

  useEffect(() => {
    if (!recommendMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (recommendMenuRef.current?.contains(t) || recommendMenuPanelRef.current?.contains(t)) return;
      setRecommendMenuOpen((prev) => (prev ? false : prev));
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
        const { chips: next, showNeighborOnlyStrip: strip } = buildFeedChipsFromPhilifeTopicOptionsJson(j);
        setShowNeighborOnlyStrip(strip);
        setChips(next);
        const allTab = j?.showAllFeedTab !== false;
        /** 전역 칩 없이 주제만 올 때 — URL/상태가 전역(빈 category)이면 첫 주제로 */
        if (!allTab && next.length) {
          setCategory((c) => (c === "" || !next.some((t) => t.slug === c) ? next[0]!.slug : c));
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
    async (nextOffset: number, append: boolean, session: number, showBlockingLoading = true) => {
      let initialLoadToken = 0;
      if (append) setLoadingMore(true);
      else {
        initialLoadToken = ++initialFeedLoadTokenRef.current;
        if (showBlockingLoading) setLoading(true);
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
          setPosts((prev) => (isSameNeighborhoodFeedRows(prev, mergedForCache ?? []) ? prev : mergedForCache ?? []));
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

  /** 주제·필터 시 피드 리셋. `categoryParam`은 deps에 넣지 않음 — `category` 낙관 갱신 후 URL이 따라올 때 이중 페치·목록 깜빡임 방지. */
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

    const canDisplayRscSeedForCurrentQuery =
      initialGlobalFeedRsc &&
      canUseRscSeedForCurrentQuery &&
      (viewerSig === initialGlobalFeedRsc.viewerKey || !neighborOnly);

    if (canDisplayRscSeedForCurrentQuery) {
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
      setErr("");
    }

    const hasRenderableRows =
      canDisplayRscSeedForCurrentQuery || !!snap?.posts?.length || postsRef.current.length > 0;
    void fetchPage(0, false, session, !hasRenderableRows);
    return () => {
      feedAbortRef.current?.abort();
    };
  }, [category, neighborOnly, viewerSig, recSortKey, fetchPage, initialGlobalFeedRsc]);

  // 상단 광고: 피드·주제 칩 이후 유휴 시 로드 (첫 페인트·메인 fetch와 경합 완화)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      runSingleFlight("community-inline-ad-card:active-plife", () =>
        fetch("/api/ads/active?boardKey=plife", { credentials: "include" })
      )
        .then((r) => r.clone().json())
        .then((j: { ads?: AdFeedPost[] }) => {
          if (!cancelled && j.ads) setTopAds(j.ads);
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
      cancelled = true;
      cancelScheduled?.();
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
  const feedPaintQueryKey = `${category.trim().toLowerCase()}\u001f${neighborOnly ? "1" : "0"}\u001f${recSortKey}`;
  const searchKeyForNav = searchParams.toString();
  const philifeComposeHref = buildPhilifeComposeHref(category);
  const setPhilifeRecommendSort = useCallback(
    (mode: "latest" | "recommended") => {
      if (normalizeFeedSort(sortParam) !== mode && !guardBeforeNavigate()) return;
      const sp = new URLSearchParams(searchKeyForNav);
      sp.set("sort", mode);
      const next = sp.toString();
      beginMenuNavigation(next ? `${pathname}?${next}` : pathname, "community-topic");
      void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [beginMenuNavigation, pathname, router, searchKeyForNav, sortParam, guardBeforeNavigate]
  );
  const applyRecommendSort = useCallback(
    (mode: "latest" | "recommended") => {
      setPhilifeRecommendSort(mode);
      setRecommendMenuOpen(false);
    },
    [setPhilifeRecommendSort]
  );

  const onPhilifeGlobalSortChipTap = useCallback(() => {
    setRecommendMenuOpen(false);
    applyRecommendSort("latest");
  }, [applyRecommendSort]);

  const onPhilifeGlobalSortChipLongPress = useCallback(() => {
    setRecommendMenuOpen(true);
  }, []);

  const philifeGlobalSortChipGestures = useLongPressOrTap({
    onTap: onPhilifeGlobalSortChipTap,
    onLongPress: onPhilifeGlobalSortChipLongPress,
  });

  /** 주제 탭: 상태 + `?category=` 동기화 — 새로고침·공유 시에도 동일 주제, 시드/캐시 키와도 맞음 */
  const applyCategoryTab = useCallback(
    (nextSlug: string) => {
      const t = nextSlug.trim();
      if (t !== category.trim() && !guardBeforeNavigate()) return;
      setCategory(t);
      const sp = new URLSearchParams(searchKeyForNav);
      if (t) sp.set("category", t);
      else sp.delete("category");
      const next = sp.toString();
      beginMenuNavigation(next ? `${pathname}?${next}` : pathname, "community-topic");
      void router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [beginMenuNavigation, pathname, router, searchKeyForNav, category, guardBeforeNavigate]
  );

  const prefetchCategoryFeedByIntent = useCallback(
    (chip: PhilifeFeedTopicChip) => {
      if (isConstrainedNetwork()) return;
      const targetCategory = isGlobalSortDropdownChip(chip) ? "" : chip.slug.trim();
      const targetSort = resolvePhilifeFeedSortForQuery(targetCategory, sortParam);
      const targetSortKey = targetCategory ? "" : targetSort;
      const cacheHit = readPhilifeFeedCache(
        PHILIFE_GLOBAL_FEED_SESSION_KEY,
        targetCategory,
        neighborOnly,
        viewerSig,
        targetSortKey
      );
      if (cacheHit?.posts?.length) return;
      const prefetchKey = `${targetCategory}\u001f${neighborOnly ? "1" : "0"}\u001f${targetSortKey}`;
      const now = Date.now();
      const last = adjacentPrefetchAtRef.current[prefetchKey] ?? 0;
      if (now - last < 10_000) return;
      adjacentPrefetchAtRef.current[prefetchKey] = now;
      const url = buildPhilifeNeighborhoodFeedClientUrl({
        globalFeed: true,
        category: targetCategory && !isPhilifeRecommendSortCategory(targetCategory) ? targetCategory : undefined,
        neighborOnly,
        offset: 0,
        limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
        ...(targetCategory ? {} : { sort: targetSort }),
      });
      const personalized = neighborOnly || viewerSig !== "_anon";
      void runSingleFlight(`community-feed:intent-prefetch:${prefetchKey}`, async () => {
        try {
          const res = await fetch(url, {
            credentials: "include",
            priority: "high",
            ...(personalized ? { cache: "no-store" as RequestCache } : {}),
          });
          const j = (await res.json()) as {
            ok?: boolean;
            posts?: NeighborhoodFeedPostDTO[];
            hasMore?: boolean;
            nextOffset?: number | null;
            dbPageLength?: number;
          };
          if (!res.ok || !j.ok || !Array.isArray(j.posts) || j.posts.length === 0) return;
          const advance = typeof j.dbPageLength === "number" ? j.dbPageLength : j.posts.length;
          const resolvedNextOffset = typeof j.nextOffset === "number" ? j.nextOffset : advance;
          writePhilifeFeedCache(
            PHILIFE_GLOBAL_FEED_SESSION_KEY,
            targetCategory,
            neighborOnly,
            viewerSig,
            {
              posts: dedupeNeighborhoodFeedById(j.posts),
              hasMore: !!j.hasMore,
              nextOffset: resolvedNextOffset,
            },
            targetSortKey
          );
        } catch {
          /* intent prefetch 실패는 무시 */
        }
      });
    },
    [sortParam, neighborOnly, viewerSig]
  );

  const activeTopicTabIndex = useMemo(
    () => resolveActiveTopicTabIndex(chips, category),
    [chips, category]
  );

  useEffect(() => {
    if (!chips.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (initialPrewarmDoneRef.current) return;
    initialPrewarmDoneRef.current = true;
    const initialTargets = chips.slice(0, 3);
    for (const chip of initialTargets) {
      prefetchCategoryFeedByIntent(chip);
    }
  }, [chips, prefetchCategoryFeedByIntent]);

  useEffect(() => {
    if (!chips.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const immediateTargets = chips
      .map((chip, idx) => ({ chip, dist: Math.abs(idx - activeTopicTabIndex) }))
      .filter((item) => item.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((item) => item.chip);
    for (const chip of immediateTargets) {
      prefetchCategoryFeedByIntent(chip);
    }
  }, [chips, activeTopicTabIndex, prefetchCategoryFeedByIntent]);

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
  /**
   * 홈 범위 탭이면 `scrollLeft` 복귀, 오른쪽 바깥 탭만 전진·왼쪽 잘리면 선택 기준 스크롤.
   * `scrollPhilifeTopicTabStrip` + 세대 ref + 이중 rAF.
   */
  useLayoutEffect(() => {
    firstCardPaintQueryKeyRef.current = feedPaintQueryKey;
    firstCardPaintStartRef.current = performance.now();
  }, [feedPaintQueryKey]);

  useEffect(() => {
    if (loading || err || postsForList.length === 0) return;
    if (firstCardPaintQueryKeyRef.current !== feedPaintQueryKey) return;
    const root = listRootRef.current;
    if (!root) return;
    const firstCard = root.querySelector("li");
    if (!firstCard) return;
    const startedAt = firstCardPaintStartRef.current;
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    queueMicrotask(() => {
      if (typeof requestAnimationFrame !== "function") return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const elapsed = Math.round(performance.now() - startedAt);
          recordAppWidePhaseLastMs("community_list_swipe_first_card_paint_ms", elapsed);
          setPhilifePerfMirrorDev({ community_list_swipe_first_card_paint_ms: elapsed });
          firstCardPaintStartRef.current = 0;
        });
      });
    });
  }, [feedPaintQueryKey, loading, err, postsForList.length]);

  useLayoutEffect(() => {
    if (!chipsLoadDone) return;
    const myGen = ++topicTabScrollGenRef.current;
    const toCancel: number[] = [];
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        if (topicTabScrollGenRef.current !== myGen) return;
        const root = topicTablistRef.current;
        if (!root) return;
        const sel = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        if (!sel) return;
        scrollPhilifeTopicTabStrip(root, sel, activeTopicTabIndex, 6);
      });
      toCancel.push(r2);
    });
    toCancel.push(r1);
    return () => {
      topicTabScrollGenRef.current += 1;
      for (const id of toCancel) cancelAnimationFrame(id);
    };
  }, [chipsLoadDone, activeTopicTabIndex, category]);

  const swipeToNextTab = useCallback(() => {
    if (!chips.length) return;
    const i = activeTopicTabIndex;
    if (i < chips.length - 1) {
      const next = chips[i + 1]!;
      applyCategoryTab(isGlobalSortDropdownChip(next) ? "" : next.slug);
      return;
    }
    const href = getBottomNavAdjacentHref("community", "next") ?? "/market";
    if (!guardBeforeNavigate()) return;
    void router.push(href, { scroll: false });
  }, [chips, activeTopicTabIndex, applyCategoryTab, router, guardBeforeNavigate]);

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

  useEffect(() => {
    if (!chips.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const neighborTabs = chips
        .map((chip, idx) => ({ chip, dist: Math.abs(idx - activeTopicTabIndex) }))
        .filter((item) => item.dist > 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
        .map((item) => item.chip);
      const nextBottomHref = getBottomNavAdjacentHref("community", "next");
      const prevBottomHref = getBottomNavAdjacentHref("community", "prev");
      if (nextBottomHref) void router.prefetch(nextBottomHref);
      if (prevBottomHref) void router.prefetch(prevBottomHref);

      for (const target of neighborTabs) {
        const targetCategory = isGlobalSortDropdownChip(target) ? "" : target.slug.trim();
        const targetSort = resolvePhilifeFeedSortForQuery(targetCategory, sortParam);
        const targetSortKey = targetCategory ? "" : targetSort;
        const cacheHit = readPhilifeFeedCache(
          PHILIFE_GLOBAL_FEED_SESSION_KEY,
          targetCategory,
          neighborOnly,
          viewerSig,
          targetSortKey
        );
        if (cacheHit?.posts?.length) continue;
        const prefetchKey = `${targetCategory}\u001f${neighborOnly ? "1" : "0"}\u001f${targetSortKey}`;
        const now = Date.now();
        const last = adjacentPrefetchAtRef.current[prefetchKey] ?? 0;
        if (now - last < 12_000) continue;
        adjacentPrefetchAtRef.current[prefetchKey] = now;

        const url = buildPhilifeNeighborhoodFeedClientUrl({
          globalFeed: true,
          category: targetCategory && !isPhilifeRecommendSortCategory(targetCategory) ? targetCategory : undefined,
          neighborOnly,
          offset: 0,
          limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
          ...(targetCategory ? {} : { sort: targetSort }),
        });
        const personalized = neighborOnly || viewerSig !== "_anon";
        void runSingleFlight(`community-feed:adjacent-prefetch:${prefetchKey}`, async () => {
          try {
            const res = await fetch(url, {
              credentials: "include",
              priority: "low",
              ...(personalized ? { cache: "no-store" as RequestCache } : {}),
            });
            const j = (await res.json()) as {
              ok?: boolean;
              posts?: NeighborhoodFeedPostDTO[];
              hasMore?: boolean;
              nextOffset?: number | null;
              dbPageLength?: number;
            };
            if (!res.ok || !j.ok || !Array.isArray(j.posts) || j.posts.length === 0) return;
            const advance = typeof j.dbPageLength === "number" ? j.dbPageLength : j.posts.length;
            const resolvedNextOffset = typeof j.nextOffset === "number" ? j.nextOffset : advance;
            writePhilifeFeedCache(
              PHILIFE_GLOBAL_FEED_SESSION_KEY,
              targetCategory,
              neighborOnly,
              viewerSig,
              {
                posts: dedupeNeighborhoodFeedById(j.posts),
                hasMore: !!j.hasMore,
                nextOffset: resolvedNextOffset,
              },
              targetSortKey
            );
          } catch {
            /* 인접 탭 prefetch 실패는 조용히 무시 */
          }
        });
      }
    }, 120);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [chips, activeTopicTabIndex, sortParam, neighborOnly, viewerSig, router]);

  /** idle 대기 전, 경계 스와이프 목적지와 인접 주제를 즉시 prewarm해 첫 리스트 지연을 줄인다. */
  useEffect(() => {
    if (!chips.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const nextBottomHref = getBottomNavAdjacentHref("community", "next");
    const prevBottomHref = getBottomNavAdjacentHref("community", "prev");
    if (nextBottomHref) void router.prefetch(nextBottomHref);
    if (prevBottomHref) void router.prefetch(prevBottomHref);
    const immediate = chips
      .map((chip, idx) => ({ chip, dist: Math.abs(idx - activeTopicTabIndex) }))
      .filter((item) => item.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((item) => item.chip);
    for (const chip of immediate) {
      prefetchCategoryFeedByIntent(chip);
    }
  }, [chips, activeTopicTabIndex, prefetchCategoryFeedByIntent, router]);

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
                  className={PHILIFE_TOPIC_TAB_ROW_CLASS}
                  role="tablist"
                  aria-label="피드 주제"
                >
                  {!chipsLoadDone ? (
                    <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1 py-1.5" aria-hidden>
                      <span className="h-8 w-14 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                      <span className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                      <span className="h-8 w-16 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                    </div>
                  ) : (
                    chips.map((c) => {
                      const catKey = category.trim().toLowerCase();
                      const slugKey = (c.slug ?? "").trim().toLowerCase();
                      const on = c.slug === "" ? isAllTabView : catKey === slugKey;
                      const sortModeLabel =
                        c.slug === "" ? philifeGlobalFeedSortLabel(recSortKey) : c.label;
                      const subjectChipClass = on ? PHILIFE_TOPIC_TAB_SUBJECT_ACTIVE : PHILIFE_TOPIC_TAB_SUBJECT_IDLE;
                      if (isGlobalSortDropdownChip(c)) {
                        const globalSortInteractionProps =
                          category.trim() !== ""
                            ? {
                                onClick: () => {
                                  applyCategoryTab("");
                                  setRecommendMenuOpen(false);
                                },
                              }
                            : philifeGlobalSortChipGestures.buttonProps;
                        return (
                          <button
                            key={c.slug || "rec"}
                            ref={recommendMenuRef}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-label={`${sortModeLabel}. 한 번 탭하면 최신순으로 바로 정렬하고, 길게 누르면 추천순 등 다른 정렬을 고를 수 있어요.`}
                            aria-haspopup="listbox"
                            aria-expanded={recommendMenuOpen}
                            className={PHILIFE_TOPIC_TAB_PILL_ACTIVE}
                            {...globalSortInteractionProps}
                            onPointerDown={(e) => {
                              prefetchCategoryFeedByIntent(c);
                              if (category.trim() === "") {
                                philifeGlobalSortChipGestures.buttonProps.onPointerDown?.(e);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (category.trim() !== "") return;
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setRecommendMenuOpen(true);
                              }
                            }}
                            onMouseEnter={() => prefetchCategoryFeedByIntent(c)}
                            onTouchStart={() => prefetchCategoryFeedByIntent(c)}
                            onFocus={() => prefetchCategoryFeedByIntent(c)}
                          >
                            <span className="min-w-0 flex-1 truncate">{sortModeLabel}</span>
                            {recSortKey === "recommended" ? (
                              <ChevronUp
                                className="h-3.5 w-3.5 shrink-0 text-sam-primary"
                                strokeWidth={2.4}
                                aria-hidden
                              />
                            ) : (
                              <ChevronDown
                                className="h-3.5 w-3.5 shrink-0 text-sam-primary"
                                strokeWidth={2.4}
                                aria-hidden
                              />
                            )}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={c.slug || "all"}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => applyCategoryTab(c.slug === "" ? "" : c.slug)}
                          onMouseEnter={() => prefetchCategoryFeedByIntent(c)}
                          onTouchStart={() => prefetchCategoryFeedByIntent(c)}
                          onPointerDown={() => prefetchCategoryFeedByIntent(c)}
                          onFocus={() => prefetchCategoryFeedByIntent(c)}
                          className={subjectChipClass}
                        >
                          <span className="block min-w-0 max-w-[min(12rem,40vw)] truncate">{c.label}</span>
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
                <Link
                  href={philifeComposeHref}
                  className="font-semibold text-[#7360F2]"
                  onClick={(e) => {
                    if (!guardBeforeNavigate()) e.preventDefault();
                  }}
                >
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
            <ul ref={listRootRef} className={`${PHILIFE_FEED_LIST_WRAP_CLASS} ${topAds.length > 0 ? "mt-1" : ""}`}>
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
