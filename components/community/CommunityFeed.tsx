"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { I18N_COMPACT_CHIP_LABEL } from "@/lib/ui/i18n-compact-label-classes";
import {
  fetchPhilifeNeighborhoodTopicOptions,
  invalidatePhilifeNeighborhoodTopicOptionsCache,
  peekPhilifeNeighborhoodTopicOptionsFromCache,
  seedPhilifeNeighborhoodTopicOptionsCache,
} from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";
import {
  buildFeedChipsFromPhilifeTopicOptionsJson,
  type PhilifeFeedTopicChip,
} from "@/lib/philife/philife-feed-chips-from-topic-options";
import { fetchMeetingDeeplink } from "@/lib/community-messenger/home/fetch-meeting-deeplink";
import { philifeAppPaths } from "@domain/philife/paths";
import { FEED_LCP_PRIORITY_COUNT } from "@/lib/media/feed-thumbnail-display";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { DIBAY_CATEGORY_RAIL_HOST_CLASS } from "@/lib/ui/dibay-secondary-tabs";
import {
  PHILIFE_FEED_FILTER_STRIP_CLASS,
  COMMUNITY_FEED_LIST_WRAP_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
  PHILIFE_TOPIC_TAB_PILL_ACTIVE,
  PHILIFE_TOPIC_TAB_PILL_IDLE,
  PHILIFE_TOPIC_TAB_SUBJECT_ACTIVE,
  PHILIFE_TOPIC_TAB_SUBJECT_IDLE,
} from "@/lib/philife/philife-flat-ui-classes";
import { buildPhilifeComposeHref } from "@/lib/philife/compose-href";
import { PhilifePullRefreshHint } from "@/components/philife/PhilifePullRefreshHint";
import { PhilifePullRefreshRegister } from "@/components/philife/PhilifePullRefreshRegister";
import { usePhilifePullRefresh } from "@/lib/philife/use-philife-pull-refresh";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { invalidateNeighborhoodFeedClientShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { whenAppShellReady } from "@/lib/startup/startup-metrics";
import { CommunityCard } from "./CommunityCard";
import { AdPostCard } from "@/components/ads/AdPostCard";
import { FeedAdBannerCarousel } from "@/components/ads/FeedAdBannerCarousel";
import {
  feedAdSlotSeed,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
} from "@/lib/ads/feed-ad-slot-policy";
import { getOrCreateFeedAdSessionId } from "@/lib/ads/feed-ad-session";
import { resolveCommunityFeedSurface } from "@/lib/community/resolve-community-feed-surface";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import type { AdFeedPost } from "@/lib/ads/types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  clearAllPhilifeFeedPersistentCaches,
  clearPhilifeFeedCacheEntry,
  philifeFeedViewerSig,
  readPhilifeFeedCache,
  resolvePhilifeColdBootViewerSig,
  writePhilifeFeedCache,
} from "@/lib/community/philife-feed-session-cache";
import {
  dedupeNeighborhoodFeedById,
  mergeNeighborhoodFeedById,
  patchNeighborhoodFeedRows,
} from "@/lib/community/neighborhood-feed-row-merge";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import {
  isSameCommunityTopicOptionsAuthority,
  resolveCommunityFeedBootSelection,
  resolveInitialCommunityFeedSnapshot,
} from "@/lib/community/resolve-initial-community-feed-snapshot";
import {
  buildCommunityFeedHref,
  communityNavToFeedQuery,
  composeCommunityNavItems,
  communityNavSelectionKey,
  defaultCommunityNavSelection,
  isSameCommunityNavSelection,
  parseCommunityNavFromSearchParams,
  type CommunityAllSort,
  type CommunityNavComposeItem,
  type CommunityNavSelection,
} from "@/lib/community/community-nav";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import { getBottomNavAdjacentHref } from "@/lib/main-menu/bottom-nav-config";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildPhilifeNeighborhoodFeedClientUrl,
  NEIGHBORHOOD_FEED_PAGE_SIZE,
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
  philifeFeedSessionKeyForLocation,
} from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { isSamarketPhilifeFeedPerfDiagEnabled } from "@/lib/debug/samarket-client-console-flags";
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
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { useRegionOptional } from "@/contexts/RegionContext";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
} from "@/lib/neighborhood/location-key";

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
    (window.location.pathname === "/philife" || window.location.pathname === "/") &&
    isSamarketPhilifeFeedPerfDiagEnabled()
  );
}

function philifePerfDiag(event: string, extra: Record<string, unknown>): void {
  if (!philifePerfDiagEnabled() || typeof console.debug !== "function") return;
  console.debug(`[community-feed:perf-diag] ${event}`, extra);
}

const COMMUNITY_HUB_STATE_KEY = "community_hub_state_v1";

type CommunityHubStateShape = { nav: string; category: string; sort: string };

function readCommunityHubState(): CommunityHubStateShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COMMUNITY_HUB_STATE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { nav?: unknown; category?: unknown; sort?: unknown };
    return {
      nav: typeof j.nav === "string" ? j.nav.trim().toLowerCase() : "",
      category: typeof j.category === "string" ? j.category.trim().toLowerCase() : "",
      sort: typeof j.sort === "string" ? j.sort.trim().toLowerCase() : "",
    };
  } catch {
    return null;
  }
}

/** `CommunityNavSelection` → hub state shape (URL 과 같은 authority) */
function communityNavSelectionToHubState(sel: CommunityNavSelection): CommunityHubStateShape {
  if (sel.kind === "topic") {
    return { nav: "", category: sel.topicSlug.trim().toLowerCase(), sort: "" };
  }
  if (sel.kind === "local") {
    return { nav: "local", category: "", sort: "" };
  }
  /** home/popular kinds absorb to all+sort */
  if (sel.kind === "popular") {
    return { nav: "all", category: "", sort: "popular" };
  }
  if (sel.kind === "home") {
    return { nav: "all", category: "", sort: "latest" };
  }
  return { nav: "all", category: "", sort: sel.allSort === "popular" ? "popular" : "latest" };
}

function hubStateToCommunityNavSelection(h: CommunityHubStateShape): CommunityNavSelection {
  if (h.nav === "local") return { kind: "local", topicSlug: "", allSort: "latest" };
  if (h.category) return { kind: "topic", topicSlug: h.category, allSort: "latest" };
  if (h.nav === "all") {
    return { kind: "all", topicSlug: "", allSort: h.sort === "popular" ? "popular" : "latest" };
  }
  /** Legacy home / popular chip hub → all+sort */
  if (h.nav === "popular" || h.sort === "popular") {
    return { kind: "all", topicSlug: "", allSort: "popular" };
  }
  if (h.nav === "home" || h.sort === "latest" || h.sort === "recommended") {
    return { kind: "all", topicSlug: "", allSort: "latest" };
  }
  return { kind: "all", topicSlug: "", allSort: "latest" };
}

function writeCommunityHubState(sel: CommunityNavSelection): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(COMMUNITY_HUB_STATE_KEY, JSON.stringify(communityNavSelectionToHubState(sel)));
  } catch {
    /* ignore */
  }
}

function isCommunityHubPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/" || p === "/philife" || p === "/community";
}

/** `CommunityNavComposeItem` → 해당 항목을 선택했을 때의 `CommunityNavSelection` */
function communityNavComposeItemToSelection(item: CommunityNavComposeItem): CommunityNavSelection {
  if (item.kind === "topic") return { kind: "topic", topicSlug: item.slug, allSort: "latest" };
  return { kind: "local", topicSlug: "", allSort: "latest" };
}

function resolveActiveNavIndex(items: CommunityNavComposeItem[], sel: CommunityNavSelection): number {
  if (!items.length) return 0;
  if (sel.kind === "all" || sel.kind === "home" || sel.kind === "popular") {
    /** Latest|Popular are fixed leading tabs outside compose items */
    return -1;
  }
  if (sel.kind === "topic") {
    const ix = items.findIndex((it) => it.kind === "topic" && it.slug === sel.topicSlug);
    return ix >= 0 ? ix : 0;
  }
  const ix = items.findIndex((it) => it.kind === sel.kind);
  return ix >= 0 ? ix : 0;
}

/**
 * `scrollLeft === 0`일 때 뷰 안에 **완전히** 들어오는 마지막 탭 인덱스까지 = **홈 범위**.
 * - Latest|Popular(`activeIndex < 0`) 또는 그 범위의 탭을 고르면 **`scrollLeft = 0`** 원점 복귀.
 * - 그보다 오른쪽 탭만: 오른쪽 잘림 → 한 단계 전진 + peel; 왼쪽 잘림 → 선택 탭이 왼쪽에 오도록 `scrollLeft`만 맞춤.
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

export function CommunityFeed({
  initialGlobalFeedRsc = null,
}: {
  initialGlobalFeedRsc?: PhilifeGlobalFeedInitialRsc | null;
} = {}) {
  const { t, language, safeT } = useI18n();
  const { open: openPhilifeWriteSheet } = usePhilifeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const router = useRouter();
  const pathname = usePathname();
  const { beginMenuNavigation } = useLatestMenuNavigation();
  const searchParams = useSearchParams();
  /** `useSearchParams` 객체는 렌더마다 참조가 바뀔 수 있어 router.replace effect 가 무한 재실행됨 → 문자열만 의존 */
  const searchQueryString = searchParams.toString();
  const viewerSig = usePhilifeFeedViewerSig();
  const regionCtx = useRegionOptional();
  const currentRegion = regionCtx?.currentRegion ?? null;
  const locationKey = useMemo(
    () => neighborhoodLocationKeyFromRegion(currentRegion) ?? "",
    [currentRegion]
  );
  const locationMeta = useMemo(
    () => neighborhoodLocationMetaFromRegion(currentRegion),
    [currentRegion]
  );

  /** Community Navigation SSOT — Latest | Popular | Topic… | Local */
  const navSelection = parseCommunityNavFromSearchParams(searchParams);
  const plan = communityNavToFeedQuery(navSelection);
  const feedSort = plan.feedSort;

  const initialTopicOptions = initialGlobalFeedRsc?.topicOptionsSeed ?? null;
  const initialBootSelection = resolveCommunityFeedBootSelection(
    plan.category,
    initialTopicOptions
  );
  const canBootFromInitialGlobalFeed =
    !!initialGlobalFeedRsc &&
    (!plan.requiresRegion || !!locationKey) &&
    initialBootSelection.authorityReady &&
    initialGlobalFeedRsc.seededCategory === initialBootSelection.category &&
    initialGlobalFeedRsc.seededSort === feedSort;
  /**
   * Persistent cache 는 서버에서 읽을 수 없음 — 초기 state 에 넣으면 SSR/클라 하이드레이션 불일치.
   * Cold Boot Cache-First: `useLayoutEffect` 에서 snapshot 복원 후 paint (splash 는 shellReady 에서 이미 해제).
   * DO NOT: Suspense skeleton · pending blank 로 첫 paint 차단.
   */
  const bootPosts = canBootFromInitialGlobalFeed
    ? mergeNeighborhoodFeedById([], initialGlobalFeedRsc?.posts ?? [], false)
    : [];
  const bootHasMore = canBootFromInitialGlobalFeed ? !!initialGlobalFeedRsc?.hasMore : false;
  const bootNextOffset =
    canBootFromInitialGlobalFeed && typeof initialGlobalFeedRsc?.nextOffset === "number"
      ? initialGlobalFeedRsc.nextOffset
      : 0;
  const [category, setCategory] = useState<string>(initialBootSelection.category);
  const [topicOptionsAuthority, setTopicOptionsAuthority] =
    useState(initialTopicOptions);
  const topicOptionsAuthorityRef = useRef(topicOptionsAuthority);
  topicOptionsAuthorityRef.current = topicOptionsAuthority;
  /** category 가 비어 있어도 authority 확정(전체 탭) 시 feed bootstrap 1회 트리거 */
  const [topicAuthorityReady, setTopicAuthorityReady] = useState(
    initialBootSelection.authorityReady
  );
  const [neighborOnly, setNeighborOnly] = useState(false);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>(bootPosts);
  const [hasMore, setHasMore] = useState(bootHasMore);
  /** cache/RSC 없으면 true — UI는 skeleton/blank 없이 셸만 유지, network 는 background */
  const [loading, setLoading] = useState(!bootPosts.length);
  const [loadingMore, setLoadingMore] = useState(false);
  /** 최신 URL topic slug("" 은 home/local/popular) — 다른 effect 안에서 최신값 참조용 */
  const planCategoryRef = useRef(plan.category);
  planCategoryRef.current = plan.category;
  const postsRef = useRef<NeighborhoodFeedPostDTO[]>(bootPosts);
  const adjacentPrefetchAtRef = useRef<Record<string, number>>({});
  const initialPrewarmDoneRef = useRef(false);
  const listRootRef = useRef<HTMLUListElement | null>(null);
  const firstCardPaintStartRef = useRef(0);
  const firstCardPaintQueryKeyRef = useRef("");
  const [err, setErr] = useState("");
  const [topAds, setTopAds] = useState<AdFeedPost[]>([]);
  const [feedAdPool, setFeedAdPool] = useState<FeedAdCampaignView[] | null>(null);
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
    if (initialTopicOptions) {
      seedPhilifeNeighborhoodTopicOptionsCache(initialTopicOptions);
      return buildFeedChipsFromPhilifeTopicOptionsJson(initialTopicOptions).chips;
    }
    return [];
  });
  const [chipsLoadDone, setChipsLoadDone] = useState(Boolean(initialTopicOptions));
  /** 주제 옵션 API: false면「관심이웃 글만 보기」띠(체크+문구) 전체 비노출. */
  const [showNeighborOnlyStrip, setShowNeighborOnlyStrip] = useState(() => {
    if (initialTopicOptions) return initialTopicOptions.showNeighborOnlyFilter !== false;
    return true;
  });
  const hubStateRestoredRef = useRef(false);

  /** Home/All/Local/Popular: region-aware when requiresRegion; global when globalFeed */
  const feedSessionKey = plan.globalFeed
    ? PHILIFE_GLOBAL_FEED_SESSION_KEY
    : locationKey
      ? philifeFeedSessionKeyForLocation(locationKey)
      : "";

  /**
   * Persistent topic-options 는 hydration 완료 후, 첫 paint 전에만 적용한다.
   * 서버 렌더 중 localStorage 를 읽지 않아 HTML/hydration tree 를 동일하게 유지한다.
   * 동일 authority(칩)면 state 를 바꾸지 않아 neighborhood-feed reset 을 막는다.
   */
  useLayoutEffect(() => {
    const peeked = peekPhilifeNeighborhoodTopicOptionsFromCache();
    const options = peeked ?? topicOptionsAuthorityRef.current;
    if (peeked && !isSameCommunityTopicOptionsAuthority(topicOptionsAuthorityRef.current, peeked)) {
      setTopicOptionsAuthority(peeked);
      const built = buildFeedChipsFromPhilifeTopicOptionsJson(peeked);
      setChips(built.chips);
      setShowNeighborOnlyStrip(built.showNeighborOnlyStrip);
      setChipsLoadDone(true);
    }

    const selection = resolveCommunityFeedBootSelection(planCategoryRef.current, options);
    if (!selection.authorityReady) return;
    setTopicAuthorityReady(true);
    setCategory((prev) => (
      prev === selection.category ? prev : selection.category
    ));
  }, [plan.category]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  /** 레거시 `?category=recommended` → all+latest (recommended 는 topic 이 아니다) */
  useLayoutEffect(() => {
    const rawCategory = (searchParams.get("category") ?? "").trim().toLowerCase();
    if (rawCategory !== "recommend" && rawCategory !== "recommended") return;
    const target = buildCommunityFeedHref(pathname, {
      selection: { kind: "all", topicSlug: "", allSort: "latest" },
      base: searchQueryString,
    });
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === target) return;
    }
    void router.replace(target, { scroll: false });
  }, [pathname, router, searchQueryString, searchParams]);

  /**
   * Feed Banner + chip/URL must share this surface (not URL-only).
   * Nav kind is required so Local/Popular do not inherit COMMUNITY_HOME.
   */
  const feedAdSurface = useMemo(
    () => resolveCommunityFeedSurface(category, navSelection.kind),
    [category, navSelection.kind]
  );
  const feedAdSessionId = useMemo(
    () => getOrCreateFeedAdSessionId(feedAdSurface.surfaceKey),
    [feedAdSurface.surfaceKey]
  );
  const feedAdPlan = useMemo(
    () =>
      feedAdSurface.placement
        ? planFeedAdSlots(
            posts.length,
            feedAdSlotSeed({
              surfaceKey: feedAdSurface.surfaceKey,
              feedSessionId: feedAdSessionId,
            })
          )
        : planFeedAdSlots(0, "community-ads-disabled"),
    [posts.length, feedAdSurface.placement, feedAdSurface.surfaceKey, feedAdSessionId]
  );

  /** Surface SSOT: topic feed without ?category= → write slug into URL (preserve nav model). */
  useEffect(() => {
    if (!topicAuthorityReady) return;
    if (feedAdSurface.placement !== "COMMUNITY_TOPIC") return;
    const want = feedAdSurface.topicSlug ?? "";
    if (!want) return;
    if (plan.category === want) return;
    const target = buildCommunityFeedHref(pathname, {
      selection: { kind: "topic", topicSlug: want, allSort: "latest" },
      base: searchQueryString,
    });
    void router.replace(target, { scroll: false });
  }, [
    topicAuthorityReady,
    feedAdSurface.placement,
    feedAdSurface.topicSlug,
    plan.category,
    searchQueryString,
    pathname,
    router,
  ]);

  /** Hub remount without params — restore last nav selection */
  useLayoutEffect(() => {
    if (hubStateRestoredRef.current) return;
    if (!isCommunityHubPath(pathname)) return;
    const hasNavParams =
      searchParams.has("nav") ||
      searchParams.has("category") ||
      searchParams.has("sort") ||
      searchParams.has("mode");
    if (hasNavParams) {
      hubStateRestoredRef.current = true;
      return;
    }
    const saved = readCommunityHubState();
    hubStateRestoredRef.current = true;
    if (!saved) return;
    const selection = hubStateToCommunityNavSelection(saved);
    if (isSameCommunityNavSelection(selection, defaultCommunityNavSelection())) return;
    const target = buildCommunityFeedHref(pathname, { selection });
    if (target === pathname) return;
    void router.replace(target, { scroll: false });
  }, [pathname, searchParams, router]);

  /** Persist hub state for detail-back / tab remount */
  useEffect(() => {
    if (!isCommunityHubPath(pathname)) return;
    const hasNavParams =
      searchParams.has("nav") ||
      searchParams.has("category") ||
      searchParams.has("sort") ||
      searchParams.has("mode");
    /**
     * Bare /philife remount: layout restore reads sessionStorage first.
     * Do not overwrite saved topic/local/sort with parsed default all+latest before replace runs.
     */
    if (!hasNavParams && isSameCommunityNavSelection(navSelection, defaultCommunityNavSelection())) {
      return;
    }
    writeCommunityHubState(navSelection);
  }, [pathname, navSelection.kind, navSelection.topicSlug, navSelection.allSort, searchParams]);

  /** `useSearchParams` 객체는 렌더마다 참조가 바뀔 수 있어 effect 가 무한 재실행됨 → 문자열만 의존 */
  const meetingIdParam = searchParams.get("meetingId")?.trim() ?? "";

  /** Philife `meetup` 피드는 쓰지 않음 — 모임 UX는 메신저 `open_chat` 로 보낸다(`meetingId` 딥링크는 아래 effect 가 처리). */
  useEffect(() => {
    if (plan.category !== "meetup") return;
    if (meetingIdParam) return;
    void router.replace(philifeAppPaths.meetingsFeed, { scroll: false });
  }, [plan.category, meetingIdParam, router]);

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
        if (!isSameCommunityTopicOptionsAuthority(topicOptionsAuthorityRef.current, j)) {
          setTopicOptionsAuthority(j);
        }
        const selection = resolveCommunityFeedBootSelection(planCategoryRef.current, j);
        if (selection.authorityReady) {
          setTopicAuthorityReady(true);
          setCategory((current) => (
            current === selection.category ? current : selection.category
          ));
        }
      } catch {
        if (!cancelled) {
          setChips([]);
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
        /** Local nav 만 지역 필요 — 다른 nav 는 지역 없이도 진행한다. */
        if (plan.requiresRegion && (!locationKey || !locationMeta)) {
          setErr(
            safeT("philife_write_err_region_required", {
              fallbackKo: "동네를 먼저 설정해 주세요.",
              fallbackEn: "Set your neighborhood first.",
            })
          );
          setHasMore(false);
          return;
        }
        const url = plan.globalFeed
          ? buildPhilifeNeighborhoodFeedClientUrl({
              globalFeed: true,
              category: category || undefined,
              neighborOnly,
              offset: nextOffset,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: feedSort,
            })
          : buildPhilifeNeighborhoodFeedClientUrl({
              locationKey,
              /** `plan.requiresRegion` 가드가 위에서 이미 통과했으므로 non-null */
              meta: locationMeta!,
              neighborOnly,
              offset: nextOffset,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: feedSort,
            });
        const personalized = neighborOnly || viewerSig !== "_anon";
        const tFetchStart = performance.now();
        const res = await fetchNeighborhoodFeedShortTtl(url, {
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
          setErr(t("community_feed_parse_failed"));
          /* fetch 실패 ≠ 빈 피드 — 세션 캐시·직전 목록 유지 */
          setHasMore(false);
          return;
        }
        if (session !== feedSessionRef.current) return;
        if (res.status === 401 && neighborOnly) {
          setErr(t("community_feed_neighbor_login_required"));
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
              ? t("community_feed_invalid_category")
              : code === "server_config"
                ? t("community_feed_server_config")
                : (j.error ?? t("community_feed_load_failed"));
          setErr(human);
          setHasMore(false);
          return;
        }
        const next = j.posts ?? [];
        const tMerge0 = performance.now();
        let patchedRows: NeighborhoodFeedPostDTO[] = next;
        if (!append) {
          /** incoming 만으로 빈 배열에서 merge 하지 않음 — prev row 참조 유지 후 삭제분만 제거 */
          setPosts((prev) => {
            patchedRows = patchNeighborhoodFeedRows(prev, next);
            return patchedRows;
          });
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

        if (!append && session === feedSessionRef.current && patchedRows.length > 0 && feedSessionKey) {
          writePhilifeFeedCache(
            feedSessionKey,
            category,
            neighborOnly,
            viewerSig,
            {
              posts: patchedRows,
              hasMore: !!j.hasMore,
              nextOffset: resolvedNextOffset,
            },
            feedSort
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
        setErr(t("community_feed_load_failed"));
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
    [
      category,
      neighborOnly,
      viewerSig,
      feedSort,
      locationKey,
      locationMeta,
      feedSessionKey,
      plan.globalFeed,
      plan.requiresRegion,
      t,
      safeT,
    ]
  );

  /** 주제·필터 시 피드 리셋. URL topic slug 와 확정된 topic-options 권한이 같은 cache/fetch 키를 사용한다. */
  useLayoutEffect(() => {
    const options = topicOptionsAuthorityRef.current;
    const bootSelection = resolveCommunityFeedBootSelection(plan.category, options);
    /**
     * topic slug 없는 cold boot(home/local/popular) 는 topic-options 권한이 정해질 때까지 추측하지 않는다.
     * category state 전환과 같은 commit 에서는 다음 layout pass 가 올바른 cache/fetch 키를 사용한다.
     */
    if (!topicAuthorityReady || !bootSelection.authorityReady || bootSelection.category !== category) {
      return;
    }

    /** Home/Local 등 requiresRegion nav — 지역 없으면 해당 nav 만 empty + CTA */
    if (plan.requiresRegion && (!locationKey || !feedSessionKey)) {
      setPosts([]);
      setHasMore(false);
      setLoading(false);
      setErr(
        safeT("philife_write_err_region_required", {
          fallbackKo: "동네를 먼저 설정해 주세요.",
          fallbackEn: "Set your neighborhood first.",
        })
      );
      return;
    }

    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    nextOffsetRef.current = 0;
    loadMoreLockRef.current = false;

    /** RSC 시드: URL 과 선택한 주제·정렬이 일치할 때만(칩만 바꾸고 URL이 안 맞는 경우가 있었음). */
    const canUseRscSeedForCurrentQuery =
      initialGlobalFeedRsc &&
      initialGlobalFeedRsc.seededCategory === plan.category &&
      initialGlobalFeedRsc.seededSort === feedSort &&
      !neighborOnly;

    const canDisplayRscSeedForCurrentQuery =
      initialGlobalFeedRsc &&
      canUseRscSeedForCurrentQuery &&
      (viewerSig === initialGlobalFeedRsc.viewerKey || !neighborOnly);

    /** Cold Boot: hook viewer 가 _anon 인 동안에도 last-viewer cache 사용 */
    const cacheViewerSig =
      viewerSig !== "_anon" ? viewerSig : resolvePhilifeColdBootViewerSig();

    if (canDisplayRscSeedForCurrentQuery) {
      const s = initialGlobalFeedRsc;
      const merged = mergeNeighborhoodFeedById([], s.posts, false);
      setPosts((prev) => patchNeighborhoodFeedRows(prev, merged));
      setHasMore(s.hasMore);
      const resolvedNext = typeof s.nextOffset === "number" ? s.nextOffset : 0;
      nextOffsetRef.current = resolvedNext;
      setErr("");
      if (merged.length) {
        writePhilifeFeedCache(
          feedSessionKey,
          category,
          neighborOnly,
          cacheViewerSig !== "_anon" ? cacheViewerSig : philifeFeedViewerSig(),
          {
            posts: merged,
            hasMore: s.hasMore,
            nextOffset: resolvedNext,
          },
          feedSort
        );
      }
      setLoading(false);
      /** Cache/RSC first paint 후 — shellReady 이전 네트워크는 splash hydrate 와 경합하므로 지연 */
      const cancelNetwork = whenAppShellReady(() => {
        void fetchPage(0, false, session, false);
      });
      return () => {
        cancelNetwork();
        feedAbortRef.current?.abort();
      };
    }

    /** Cold=Warm 단일 snapshot — tabEnterInstantBoot 전용 경로와 동일 resolver */
    const bootSnap = resolveInitialCommunityFeedSnapshot({
      href:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/philife",
      topicOptions: options,
      locationKey,
    });
    const snapMeta =
      bootSnap?.posts?.length ?
        bootSnap
      : readPhilifeFeedCache(
          feedSessionKey,
          category,
          neighborOnly,
          cacheViewerSig,
          feedSort
        );

    if (snapMeta?.posts?.length) {
      setPosts((prev) => patchNeighborhoodFeedRows(prev, snapMeta.posts));
      setHasMore(snapMeta.hasMore);
      nextOffsetRef.current =
        typeof snapMeta.nextOffset === "number" ? snapMeta.nextOffset : 0;
      setErr("");
      setLoading(false);
    } else {
      setErr("");
    }

    const hasRenderableRows = !!snapMeta?.posts?.length || postsRef.current.length > 0;
    /** hasRenderableRows 면 loading UI 없이 background sync — shellReady 이후 */
    const cancelNetwork = whenAppShellReady(() => {
      void fetchPage(0, false, session, !hasRenderableRows);
    });
    return () => {
      cancelNetwork();
      feedAbortRef.current?.abort();
    };
    /**
     * topicOptionsAuthority 객체 참조는 deps 금지 — 동일 authority 재할당이 feed abort/refetch 를 만든다.
     * authority 확정은 `category` state 로만 전파한다.
     */
  }, [
    category,
    plan.category,
    plan.requiresRegion,
    neighborOnly,
    viewerSig,
    feedSort,
    fetchPage,
    initialGlobalFeedRsc,
    topicAuthorityReady,
    locationKey,
    feedSessionKey,
    safeT,
  ]);

  const ptrDomain = useMainHubPtrDomain();
  usePhilifePullRefresh(ptrDomain === "philife");

  const onPhilifePullRefresh = useCallback(async () => {
    clearPhilifeFeedCacheEntry(
      feedSessionKey,
      category,
      neighborOnly,
      viewerSig,
      feedSort
    );
    invalidateNeighborhoodFeedClientShortTtl();
    invalidatePhilifeNeighborhoodTopicOptionsCache();
    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    const topicRefresh = fetchPhilifeNeighborhoodTopicOptions()
      .then((j) => {
        const { chips: next, showNeighborOnlyStrip: strip } =
          buildFeedChipsFromPhilifeTopicOptionsJson(j);
        setShowNeighborOnlyStrip(strip);
        setChips(next);
      })
      .catch(() => {
        /* topic chips refresh optional */
      });
    await Promise.all([fetchPage(0, false, session, false), topicRefresh]);
  }, [category, neighborOnly, viewerSig, feedSort, feedSessionKey, fetchPage]);

  /** Member Identity mutation — drop contaminated author_name snapshots; SWR refetch */
  useEffect(() => {
    const onProfileUpdated = () => {
      clearAllPhilifeFeedPersistentCaches();
      invalidateNeighborhoodFeedClientShortTtl();
      feedSessionRef.current += 1;
      const session = feedSessionRef.current;
      void fetchPage(0, false, session, false);
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, [fetchPage]);

  // 상단 광고: 피드·주제 칩 이후 유휴 시 로드 (첫 페인트·메인 fetch와 경합 완화)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      runSingleFlight(`community-inline-ad-card:active-plife:${category || "all"}`, () =>
        fetch(
          `/api/ads/active?boardKey=plife${category ? `&topic=${encodeURIComponent(category)}` : ""}`,
          { credentials: "include" }
        )
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
  }, [category]);

  /** Feed Banner pool — one fetch per surface (slot selection is local). */
  useEffect(() => {
    if (!feedAdSurface.placement) {
      setFeedAdPool(null);
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({
      domain: "community",
      placement: feedAdSurface.placement,
      pool: "1",
    });
    if (feedAdSurface.topicSlug) qs.set("topicSlug", feedAdSurface.topicSlug);
    const key = `feed-ad-pool:${qs.toString()}`;
    void runSingleFlight(key, async () => {
      const r = await fetch(`/api/feed-ads/active?${qs.toString()}`, {
        credentials: "include",
      });
      return (await r.json()) as { campaigns?: FeedAdCampaignView[] };
    })
      .then((j) => {
        if (!cancelled) setFeedAdPool(Array.isArray(j.campaigns) ? j.campaigns : []);
      })
      .catch(() => {
        if (!cancelled) setFeedAdPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, [feedAdSurface.placement, feedAdSurface.topicSlug]);

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

  const postsForList = useMemo(() => {
    if (topAds.length === 0) return posts;
    const promotedIds = new Set(
      topAds.map((ad) => String(ad.postId ?? "").trim()).filter(Boolean)
    );
    if (promotedIds.size === 0) return posts;
    return posts.filter((p) => !promotedIds.has(String(p.id)));
  }, [posts, topAds]);
  const feedPaintQueryKey = `${category.trim().toLowerCase()}\u001f${neighborOnly ? "1" : "0"}\u001f${feedSort}`;
  const searchKeyForNav = searchParams.toString();
  const philifeComposeHref = buildPhilifeComposeHref(category);

  /** Nav 선택 단일 진입점 — 상태 갱신 + URL 동기화 + hub state 저장 (Home/Topic/Local/Popular 공통) */
  const applyNavSelection = useCallback(
    (sel: CommunityNavSelection) => {
      const changed = !isSameCommunityNavSelection(sel, navSelection);
      if (changed && !guardBeforeNavigate()) return;
      const nextCategory = sel.kind === "topic" ? sel.topicSlug.trim().toLowerCase() : "";
      setCategory(nextCategory);
      const target = buildCommunityFeedHref(pathname, { selection: sel, base: searchKeyForNav });
      beginMenuNavigation(target, "community-topic");
      writeCommunityHubState(sel);
      void router.replace(target, { scroll: false });
    },
    [
      beginMenuNavigation,
      pathname,
      router,
      searchKeyForNav,
      navSelection.kind,
      navSelection.topicSlug,
      navSelection.allSort,
      guardBeforeNavigate,
    ]
  );

  /** Home/Topic/Local/Popular 공용 prefetch — globalFeed 는 globalFeed URL, local 은 지역 필요 */
  const prefetchNavItemByIntent = useCallback(
    (item: CommunityNavComposeItem) => {
      if (isConstrainedNetwork()) return;
      const sel = communityNavComposeItemToSelection(item);
      const itemPlan = communityNavToFeedQuery(sel);
      if (itemPlan.requiresRegion && (!locationKey || !locationMeta)) return;
      const targetSessionKey = itemPlan.globalFeed
        ? PHILIFE_GLOBAL_FEED_SESSION_KEY
        : philifeFeedSessionKeyForLocation(locationKey);
      if (!targetSessionKey) return;
      const targetCategory = itemPlan.category;
      const targetSort = itemPlan.feedSort;
      const cacheHit = readPhilifeFeedCache(
        targetSessionKey,
        targetCategory,
        neighborOnly,
        viewerSig,
        targetSort
      );
      if (cacheHit?.posts?.length) return;
      const prefetchKey = `${targetSessionKey}\u001f${targetCategory}\u001f${neighborOnly ? "1" : "0"}\u001f${targetSort}`;
      const now = Date.now();
      const last = adjacentPrefetchAtRef.current[prefetchKey] ?? 0;
      if (now - last < 10_000) return;
      adjacentPrefetchAtRef.current[prefetchKey] = now;
      const url = itemPlan.globalFeed
        ? buildPhilifeNeighborhoodFeedClientUrl({
            globalFeed: true,
            category: targetCategory || undefined,
            neighborOnly,
            offset: 0,
            limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
            sort: targetSort,
          })
        : buildPhilifeNeighborhoodFeedClientUrl({
            locationKey,
            meta: locationMeta!,
            neighborOnly,
            offset: 0,
            limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
            sort: targetSort,
          });
      const personalized = neighborOnly || viewerSig !== "_anon";
      void runSingleFlight(`community-feed:intent-prefetch:${prefetchKey}`, async () => {
        try {
          const res = await fetchNeighborhoodFeedShortTtl(url, {
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
            targetSessionKey,
            targetCategory,
            neighborOnly,
            viewerSig,
            {
              posts: dedupeNeighborhoodFeedById(j.posts),
              hasMore: !!j.hasMore,
              nextOffset: resolvedNextOffset,
            },
            targetSort
          );
        } catch {
          /* intent prefetch 실패는 무시 */
        }
      });
    },
    [neighborOnly, viewerSig, locationKey, locationMeta]
  );

  const navItems = useMemo(() => composeCommunityNavItems(chips), [chips]);
  const leadingNavItems = useMemo(
    () =>
      navItems.filter(
        (item): item is Extract<CommunityNavComposeItem, { kind: "topic" }> => item.kind === "topic"
      ),
    [navItems]
  );
  const trailingNavItems = useMemo(
    () =>
      navItems.filter(
        (item): item is Extract<CommunityNavComposeItem, { kind: "local" }> => item.kind === "local"
      ),
    [navItems]
  );

  const activeTopicTabIndex = useMemo(
    () => resolveActiveNavIndex(navItems, navSelection),
    [navItems, navSelection.kind, navSelection.topicSlug]
  );

  useEffect(() => {
    if (!navItems.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (initialPrewarmDoneRef.current) return;
    initialPrewarmDoneRef.current = true;
    const initialTargets = navItems.slice(0, 3);
    for (const item of initialTargets) {
      prefetchNavItemByIntent(item);
    }
  }, [navItems, prefetchNavItemByIntent]);

  useEffect(() => {
    if (!navItems.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const immediateTargets = navItems
      .map((item, idx) => ({ item, dist: Math.abs(idx - activeTopicTabIndex) }))
      .filter((x) => x.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((x) => x.item);
    for (const item of immediateTargets) {
      prefetchNavItemByIntent(item);
    }
  }, [navItems, activeTopicTabIndex, prefetchNavItemByIntent]);

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
  const allSortButtonRef = useRef<HTMLButtonElement | null>(null);
  const allSortMenuRef = useRef<HTMLUListElement | null>(null);
  const lastAllSortRef = useRef<CommunityAllSort>(
    navSelection.kind === "all" || navSelection.kind === "popular"
      ? navSelection.kind === "popular"
        ? "popular"
        : navSelection.allSort
      : "latest"
  );
  const [allSortOpen, setAllSortOpen] = useState(false);
  const [allSortMenuPos, setAllSortMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (navSelection.kind === "all") {
      lastAllSortRef.current = navSelection.allSort === "popular" ? "popular" : "latest";
    } else if (navSelection.kind === "popular") {
      lastAllSortRef.current = "popular";
    } else if (navSelection.kind === "home") {
      lastAllSortRef.current = "latest";
    }
  }, [navSelection.kind, navSelection.allSort]);

  const displayAllSort: CommunityAllSort =
    navSelection.kind === "all"
      ? navSelection.allSort === "popular"
        ? "popular"
        : "latest"
      : lastAllSortRef.current;
  const allSortOn = navSelection.kind === "all" || navSelection.kind === "home" || navSelection.kind === "popular";
  const allSortLabel =
    displayAllSort === "popular"
      ? safeT("community_sort_popular", { fallbackKo: "인기순", fallbackEn: "Popular" })
      : safeT("community_sort_latest", { fallbackKo: "최신순", fallbackEn: "Latest" });

  const updateAllSortMenuPos = useCallback(() => {
    const el = allSortButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAllSortMenuPos({ top: rect.bottom + 6, left: rect.left });
  }, []);

  const resetTopicTabStripToOrigin = useCallback(() => {
    const root = topicTablistRef.current;
    if (!root) return;
    if (root.scrollLeft === 0) return;
    root.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  const applyAllSort = useCallback(
    (next: CommunityAllSort) => {
      lastAllSortRef.current = next;
      resetTopicTabStripToOrigin();
      applyNavSelection({ kind: "all", topicSlug: "", allSort: next });
      setAllSortOpen(false);
    },
    [applyNavSelection, resetTopicTabStripToOrigin]
  );

  const onAllSortChipClick = useCallback(() => {
    resetTopicTabStripToOrigin();
    if (!allSortOn) {
      applyNavSelection({
        kind: "all",
        topicSlug: "",
        allSort: lastAllSortRef.current,
      });
    }
    if (allSortOpen) {
      setAllSortOpen(false);
      return;
    }
    updateAllSortMenuPos();
    setAllSortOpen(true);
  }, [allSortOn, allSortOpen, applyNavSelection, resetTopicTabStripToOrigin, updateAllSortMenuPos]);

  useEffect(() => {
    if (!allSortOpen) return;
    updateAllSortMenuPos();
    const close = () => setAllSortOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (allSortButtonRef.current?.contains(target) || allSortMenuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [allSortOpen, updateAllSortMenuPos]);

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
        /** Latest|Popular (all) → topic strip origin; no selected topic tab in strip */
        if (activeTopicTabIndex < 0) {
          if (root.scrollLeft !== 0) root.scrollTo({ left: 0, behavior: "auto" });
          return;
        }
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
  }, [chipsLoadDone, activeTopicTabIndex, navSelection.kind, navSelection.allSort]);

  /**
   * 주제·동네 탭 선택 시 본문 패널 우→좌 440ms 진입.
   * 최초 마운트·최신순|인기순(all) 전환에는 재생하지 않음.
   */
  const prevTopicPanelNavKeyRef = useRef<string | null>(null);
  const [topicPanelEnterId, setTopicPanelEnterId] = useState(0);
  useLayoutEffect(() => {
    const key = communityNavSelectionKey(navSelection);
    const isTopicStrip = navSelection.kind === "topic" || navSelection.kind === "local";
    if (!isTopicStrip) {
      prevTopicPanelNavKeyRef.current = key;
      return;
    }
    if (prevTopicPanelNavKeyRef.current === null) {
      prevTopicPanelNavKeyRef.current = key;
      return;
    }
    if (prevTopicPanelNavKeyRef.current === key) return;
    prevTopicPanelNavKeyRef.current = key;
    setTopicPanelEnterId((n) => n + 1);
  }, [navSelection.kind, navSelection.topicSlug]);

  const swipeToNextTab = useCallback(() => {
    if (!navItems.length) return;
    const i = activeTopicTabIndex;
    if (i < navItems.length - 1) {
      const next = navItems[i + 1]!;
      applyNavSelection(communityNavComposeItemToSelection(next));
      return;
    }
    const href = getBottomNavAdjacentHref("community", "next") ?? "/market";
    if (!guardBeforeNavigate()) return;
    void router.push(href, { scroll: false });
  }, [navItems, activeTopicTabIndex, applyNavSelection, router, guardBeforeNavigate]);

  const swipeToPrevTab = useCallback(() => {
    if (!navItems.length) return;
    const i = activeTopicTabIndex;
    if (i <= 0) return;
    const prev = navItems[i - 1]!;
    applyNavSelection(communityNavComposeItemToSelection(prev));
  }, [navItems, activeTopicTabIndex, applyNavSelection]);

  const feedSwipeableRef = useRef<HTMLDivElement | null>(null);
  const canSwipeToNext = useMemo(() => navItems.length > 0, [navItems.length]);
  const canSwipeToPrev = useMemo(
    () => navItems.length > 0 && activeTopicTabIndex > 0,
    [navItems.length, activeTopicTabIndex]
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
    if (!navItems.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const neighborItems = navItems
        .map((item, idx) => ({ item, dist: Math.abs(idx - activeTopicTabIndex) }))
        .filter((x) => x.dist > 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
        .map((x) => x.item);
      const nextBottomHref = getBottomNavAdjacentHref("community", "next");
      const prevBottomHref = getBottomNavAdjacentHref("community", "prev");
      if (nextBottomHref) void router.prefetch(nextBottomHref);
      if (prevBottomHref) void router.prefetch(prevBottomHref);

      for (const target of neighborItems) {
        const sel = communityNavComposeItemToSelection(target);
        const itemPlan = communityNavToFeedQuery(sel);
        if (itemPlan.requiresRegion && (!locationKey || !locationMeta)) continue;
        const targetSessionKey = itemPlan.globalFeed
          ? PHILIFE_GLOBAL_FEED_SESSION_KEY
          : philifeFeedSessionKeyForLocation(locationKey);
        if (!targetSessionKey) continue;
        const targetCategory = itemPlan.category;
        const targetSort = itemPlan.feedSort;
        const cacheHit = readPhilifeFeedCache(
          targetSessionKey,
          targetCategory,
          neighborOnly,
          viewerSig,
          targetSort
        );
        if (cacheHit?.posts?.length) continue;
        const prefetchKey = `${targetSessionKey}\u001f${targetCategory}\u001f${neighborOnly ? "1" : "0"}\u001f${targetSort}`;
        const now = Date.now();
        const last = adjacentPrefetchAtRef.current[prefetchKey] ?? 0;
        if (now - last < 12_000) continue;
        adjacentPrefetchAtRef.current[prefetchKey] = now;

        const url = itemPlan.globalFeed
          ? buildPhilifeNeighborhoodFeedClientUrl({
              globalFeed: true,
              category: targetCategory || undefined,
              neighborOnly,
              offset: 0,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: targetSort,
            })
          : buildPhilifeNeighborhoodFeedClientUrl({
              locationKey,
              meta: locationMeta!,
              neighborOnly,
              offset: 0,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: targetSort,
            });
        const personalized = neighborOnly || viewerSig !== "_anon";
        void runSingleFlight(`community-feed:adjacent-prefetch:${prefetchKey}`, async () => {
          try {
            const res = await fetchNeighborhoodFeedShortTtl(url, {
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
              targetSessionKey,
              targetCategory,
              neighborOnly,
              viewerSig,
              {
                posts: dedupeNeighborhoodFeedById(j.posts),
                hasMore: !!j.hasMore,
                nextOffset: resolvedNextOffset,
              },
              targetSort
            );
          } catch {
            /* 인접 탭 prefetch 실패는 조용히 무시 */
          }
        });
      }
    }, 120);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [navItems, activeTopicTabIndex, neighborOnly, viewerSig, router, locationKey, locationMeta]);

  /** idle 대기 전, 경계 스와이프 목적지와 인접 주제를 즉시 prewarm해 첫 리스트 지연을 줄인다. */
  useEffect(() => {
    if (!navItems.length) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const nextBottomHref = getBottomNavAdjacentHref("community", "next");
    const prevBottomHref = getBottomNavAdjacentHref("community", "prev");
    if (nextBottomHref) void router.prefetch(nextBottomHref);
    if (prevBottomHref) void router.prefetch(prevBottomHref);
    const immediate = navItems
      .map((item, idx) => ({ item, dist: Math.abs(idx - activeTopicTabIndex) }))
      .filter((x) => x.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((x) => x.item);
    for (const item of immediate) {
      prefetchNavItemByIntent(item);
    }
  }, [navItems, activeTopicTabIndex, prefetchNavItemByIntent, router]);

  return (
    <div className={PHILIFE_PAGE_ROOT_CLASS} data-community-renderer="canonical-v1" data-community-feed="list">
      <PhilifePullRefreshRegister onRefresh={onPhilifePullRefresh} />
      <MySubpageHeader
        registerMainTier1={false}
        hideCtaStrip
        stickyBelow={
          <>
            <PhilifePullRefreshHint />
            <div className={`min-w-0 ${DIBAY_CATEGORY_RAIL_HOST_CLASS}`}>
              <div
                className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} ${DIBAY_CATEGORY_RAIL_HOST_CLASS} flex min-w-0 items-center gap-1 border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))] py-1.5`}
                data-dibay-nav="category"
              >
                <button
                  type="button"
                  role="tab"
                  ref={allSortButtonRef}
                  aria-selected={allSortOn}
                  aria-haspopup="listbox"
                  aria-expanded={allSortOpen}
                  aria-label={t("community_feed_all_sort_chip_aria", { label: allSortLabel })}
                  onClick={onAllSortChipClick}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      updateAllSortMenuPos();
                      setAllSortOpen(true);
                    }
                  }}
                  className={
                    allSortOn
                      ? `${PHILIFE_TOPIC_TAB_PILL_ACTIVE} inline-flex items-center gap-1`
                      : `${PHILIFE_TOPIC_TAB_PILL_IDLE} inline-flex items-center gap-1`
                  }
                >
                  <span className={`relative z-[1] ${I18N_COMPACT_CHIP_LABEL}`}>{allSortLabel}</span>
                  {allSortOpen ? (
                    <ChevronUp
                      className={`relative z-[1] h-3.5 w-3.5 shrink-0 ${allSortOn ? "text-sam-primary" : "text-sam-muted"}`}
                      strokeWidth={2.4}
                      aria-hidden
                    />
                  ) : (
                    <ChevronDown
                      className={`relative z-[1] h-3.5 w-3.5 shrink-0 ${allSortOn ? "text-sam-primary" : "text-sam-muted"}`}
                      strokeWidth={2.4}
                      aria-hidden
                    />
                  )}
                </button>
                <HorizontalDragScroll
                  ref={topicTablistRef}
                  allowDragFromInteractive
                  className="flex min-h-10 min-w-0 max-w-full flex-1 flex-nowrap items-center justify-start gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ WebkitOverflowScrolling: "touch" }}
                  role="tablist"
                  aria-label={t("community_feed_topic_aria")}
                >
                  {leadingNavItems.map((item) => {
                      const on = navSelection.kind === "topic" && navSelection.topicSlug === item.slug;
                      const chipLabel = resolveCommunityTopicUILabel(language, item.label, item.name_en, item.slug);
                      return (
                        <button
                          key={item.slug}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => applyNavSelection({ kind: "topic", topicSlug: item.slug, allSort: "latest" })}
                          onMouseEnter={() => prefetchNavItemByIntent(item)}
                          onTouchStart={() => prefetchNavItemByIntent(item)}
                          onPointerDown={() => prefetchNavItemByIntent(item)}
                          onFocus={() => prefetchNavItemByIntent(item)}
                          className={on ? PHILIFE_TOPIC_TAB_SUBJECT_ACTIVE : PHILIFE_TOPIC_TAB_SUBJECT_IDLE}
                        >
                          <span className={`block min-w-0 max-w-[min(12rem,40vw)] truncate ${I18N_COMPACT_CHIP_LABEL}`}>
                            {chipLabel}
                          </span>
                        </button>
                      );
                  })}
                  {!chipsLoadDone ? (
                    <span className="flex shrink-0 items-center gap-1" aria-hidden>
                      <span className="h-8 w-14 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                      <span className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                    </span>
                  ) : null}
                  {trailingNavItems.map((item) => {
                    const on = navSelection.kind === "local";
                    const label = safeT("community_feed_mode_local", {
                      fallbackKo: "동네",
                      fallbackEn: "Local",
                    });
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => applyNavSelection(communityNavComposeItemToSelection(item))}
                        onMouseEnter={() => prefetchNavItemByIntent(item)}
                        onTouchStart={() => prefetchNavItemByIntent(item)}
                        onPointerDown={() => prefetchNavItemByIntent(item)}
                        onFocus={() => prefetchNavItemByIntent(item)}
                        className={on ? PHILIFE_TOPIC_TAB_PILL_ACTIVE : PHILIFE_TOPIC_TAB_SUBJECT_IDLE}
                      >
                        <span className={`block min-w-0 max-w-[min(12rem,40vw)] truncate ${I18N_COMPACT_CHIP_LABEL}`}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </HorizontalDragScroll>
              </div>
              {allSortOpen && allSortMenuPos && typeof document !== "undefined"
                ? createPortal(
                    <ul
                      ref={allSortMenuRef}
                      role="listbox"
                      aria-label={t("community_feed_all_sort_menu_aria")}
                      className="min-w-[10rem] rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
                      style={{
                        position: "fixed",
                        top: allSortMenuPos.top,
                        left: allSortMenuPos.left,
                        zIndex: 200,
                      }}
                    >
                      {(
                        [
                          {
                            key: "latest" as const,
                            label: safeT("community_sort_latest", {
                              fallbackKo: "최신순",
                              fallbackEn: "Latest",
                            }),
                          },
                          {
                            key: "popular" as const,
                            label: safeT("community_sort_popular", {
                              fallbackKo: "인기순",
                              fallbackEn: "Popular",
                            }),
                          },
                        ] as const
                      ).map((opt) => {
                        const selected = displayAllSort === opt.key && allSortOn;
                        return (
                          <li key={opt.key} role="none">
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => applyAllSort(opt.key)}
                              className={
                                selected
                                  ? "block w-full px-3 py-2 text-left text-[length:calc(14px-1pt)] font-extrabold text-sam-primary transition hover:bg-sam-primary-soft"
                                  : "block w-full px-3 py-2 text-left text-[length:calc(14px-1pt)] font-semibold text-sam-fg transition hover:bg-sam-surface-muted"
                              }
                            >
                              {opt.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>,
                    document.body
                  )
                : null}
            </div>
            {showNeighborOnlyStrip ? (
              <div className={PHILIFE_FEED_FILTER_STRIP_CLASS}>
                <div className={`min-w-0 space-y-1 ${APP_MAIN_HEADER_INNER_CLASS}`}>
                  <label className="flex cursor-pointer items-center gap-2 px-0 text-[14px] text-sam-fg">
                    <input
                      type="checkbox"
                      checked={neighborOnly}
                      onChange={(e) => setNeighborOnly(e.target.checked)}
                      className="h-4 w-4 rounded-[4px] border-sam-border text-sam-primary focus:ring-sam-primary/30"
                    />
                    {t("community_feed_neighbor_filter")}
                  </label>
                  <p className="text-[13px] leading-[1.45] text-sam-muted">{t("community_feed_neighbor_strip_hint")}</p>
                </div>
              </div>
            ) : null}
          </>
        }
      />

      <div className="relative min-w-0 overflow-x-hidden">
        <div ref={setFeedSwipeable} className="will-change-transform touch-pan-y min-w-0">
        <div
          key={topicPanelEnterId > 0 ? `topic-panel-${topicPanelEnterId}` : "topic-panel-boot"}
          className={
            topicPanelEnterId > 0
              ? "community-topic-panel-slide-in relative min-w-0"
              : "relative min-w-0"
          }
        >
        {loading && postsForList.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] animate-pulse bg-sam-primary/60"
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
        {loading && postsForList.length === 0 && !err ? null : !err && postsForList.length === 0 ? (
          <div className={`${APP_MAIN_GUTTER_X_CLASS} py-12 text-center text-[14px] text-sam-muted`}>
            {t("community_feed_empty")}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {category === "meetup" ? (
                <Link
                  href={philifeComposeHref}
                  className="font-semibold text-sam-primary"
                  onClick={(e) => {
                    if (!guardBeforeNavigate()) e.preventDefault();
                  }}
                >
                  {t("community_meeting_post_cta")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openPhilifeWriteSheet(category)}
                  className="font-semibold text-sam-primary underline decoration-sam-primary/40 underline-offset-2"
                >
                  {t("community_first_post_cta")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <ul ref={listRootRef} className={`${COMMUNITY_FEED_LIST_WRAP_CLASS} ${topAds.length > 0 ? "mt-1" : ""}`}>
              {postsForList.map((p, index) => (
                <Fragment key={p.id}>
                  <li className="list-none">
                    <CommunityCard post={p} priorityThumb={index < FEED_LCP_PRIORITY_COUNT} />
                  </li>
                  {feedAdSurface.placement &&
                  shouldInjectFeedAdAtContentIndex(index, feedAdPlan) ? (
                    <FeedAdBannerCarousel
                      domain="community"
                      placement={feedAdSurface.placement}
                      topicSlug={feedAdSurface.topicSlug}
                      surfaceKey={feedAdSurface.surfaceKey}
                      feedSessionId={feedAdSessionId}
                      slotOrdinal={feedAdPlan.slotOrdinalByContentIndex.get(index) ?? 0}
                      campaignPool={feedAdPool ?? []}
                    />
                  ) : null}
                </Fragment>
              ))}
            </ul>
            <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
            {loadingMore ? (
              <p className="py-4 text-center text-[13px] text-sam-muted">{t("community_feed_loading_more")}</p>
            ) : null}
            {!hasMore && postsForList.length > 0 ? (
              <p className="pb-8 pt-2 text-center text-[13px] text-sam-meta">{t("community_feed_all_loaded")}</p>
            ) : null}
          </>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
