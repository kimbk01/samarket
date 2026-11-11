"use client";

import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from "react";
import { HUB_DATA_REVISIT_FRESH_MS, useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
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
import { FEED_LCP_PRIORITY_COUNT } from "@/lib/media/feed-thumbnail-display";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  DIBAY_SECONDARY_TAB_CHEVRON_CLASS,
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import {
  PHILIFE_FEED_FILTER_STRIP_CLASS,
  COMMUNITY_FEED_LIST_WRAP_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { PhilifePullRefreshHint } from "@/components/philife/PhilifePullRefreshHint";
import { PhilifePullRefreshRegister } from "@/components/philife/PhilifePullRefreshRegister";
import { usePhilifePullRefresh } from "@/lib/philife/use-philife-pull-refresh";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { invalidateNeighborhoodFeedClientShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { whenAppShellReady } from "@/lib/startup/startup-metrics";
import {
  communityFeedShouldHoldPendingBeforeDeferredFetch,
  communityFeedShouldShowEmptyCta,
  communityInitialLoadFinallyClearsLoading,
} from "@/lib/community/community-feed-loading-ownership";
import {
  hubStateToCommunityNavSelection,
  readCommunityHubState,
  writeCommunityHubState,
} from "@/lib/community/community-hub-state";
import { useDibayAppShellAuthority } from "@/lib/device/use-dibay-app-shell";
import { CommunityCard } from "./CommunityCard";
import { CommunityFeedSkeleton } from "./CommunityFeedSkeleton";
import { FeedAdBannerCarousel } from "@/components/ads/FeedAdBannerCarousel";
import { EventPromotionHeroBanner } from "@/components/platform-events/EventPromotionHeroBanner";
import {
  feedAdSlotSeed,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
} from "@/lib/ads/feed-ad-slot-policy";
import { getOrCreateFeedAdSessionId } from "@/lib/ads/feed-ad-session";
import { resolveCommunityFeedSurface } from "@/lib/community/resolve-community-feed-surface";
import { feedAdPoolRefreshDelayMs, type FeedAdPublicCampaign } from "@/lib/ads/feed-ad-public-projection";
import type { ActiveAdFeedItem } from "@/lib/ads/types";
import {
  communityFeedBannerAllowedForSearch,
  planCommunityFeedAdPlacement,
} from "@/lib/promotion/community-feed-ad-placement";
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
import { normalizeCommunityHashtagQuery, sanitizeCommunityKeywordQuery } from "@/lib/community-feed/hashtag-discovery";
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
import { useCommunityLocalFilter } from "@/hooks/use-community-local-filter";
import { CommunityLocalFilterPickerSheet } from "@/components/community/CommunityLocalFilterPickerSheet";
import type { DibayPtrOutcome } from "@/lib/ui/ptr/dibay-ptr-ssot";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
    isCommunityHomeSurfacePath(window.location.pathname) &&
    isSamarketPhilifeFeedPerfDiagEnabled()
  );
}

function philifePerfDiag(event: string, extra: Record<string, unknown>): void {
  if (!philifePerfDiagEnabled() || typeof console.debug !== "function") return;
  console.debug(`[community-feed:perf-diag] ${event}`, extra);
}

function isCommunityHubPath(pathname: string): boolean {
  return isCommunityHomeSurfacePath(pathname);
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
  const {
    locationKey,
    locationMeta,
    filterLabel,
    filter,
    setExplicitFilter,
  } = useCommunityLocalFilter();
  const [localFilterPickerOpen, setLocalFilterPickerOpen] = useState(false);

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
  const bootNextCursorToken =
    canBootFromInitialGlobalFeed && initialGlobalFeedRsc?.nextCursorToken
      ? initialGlobalFeedRsc.nextCursorToken
      : null;
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
  const tagFilter = normalizeCommunityHashtagQuery(searchParams.get("tag"));
  /** 광고 ② D-29 (2026-11-04): 검색어(해시태그 `tag` · 키워드 `q`)가 있으면 피드 배너를 끼우지 않는다 */
  const feedSearchActive = !communityFeedBannerAllowedForSearch({
    tag: tagFilter,
    q: sanitizeCommunityKeywordQuery(searchParams.get("q")),
  });
  const clearTagFilter = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("tag");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
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
  const [topAds, setTopAds] = useState<ActiveAdFeedItem[]>([]);
  const [feedAdPool, setFeedAdPool] = useState<FeedAdPublicCampaign[] | null>(null);
  /** PV-3 — 서버가 정한 `validUntil` 에 다시 부른다(화면은 기간을 판정하지 않는다). */
  const [feedAdPoolTick, setFeedAdPoolTick] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(bootNextOffset);
  /** latest continue — keyset token from last successful page */
  const nextCursorTokenRef = useRef<string | null>(bootNextCursorToken);
  const loadMoreLockRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  /** 지역·필터가 바뀌면 증가. 이전 요청 응답은 무시해 트래픽·경합 시 UI 꼬임 방지 */
  const feedSessionRef = useRef(0);
  /** 첫 페이지 fetch 만 — 세션 불일치 시에도 마지막 요청만 `loading` 해제 */
  const initialFeedLoadTokenRef = useRef(0);
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
  /** 피드 질의 식별자(캐시 키와 같은 축, viewer 제외) — 표시 행이 어느 질의 소유인지 판정한다. */
  const feedContentKey = `${feedSessionKey}\u001f${category}\u001f${neighborOnly ? "1" : "0"}\u001f${feedSort}`;
  /** 현재 `posts` 가 속한 질의. 다른 질의의 행을 새 주제·탭 아래 보여주지 않는다. */
  const postsContentKeyRef = useRef(bootPosts.length > 0 ? feedContentKey : "");
  /** 화면에 그려진 콘텐츠(행·로딩·안내)가 속한 질의 — 스와이프 전환의 목적지 도착 신호 */
  const [settledFeedContentKey, setSettledFeedContentKey] = useState(postsContentKeyRef.current);

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

  /**
   * Surface SSOT: topic URL slug → canonical surface slug.
   * 입력은 URL 만 — `category` state 는 URL 보다 한 render 늦을 수 있어, state 로 비교하면 진행 중인
   * 이동과 같은(또는 이전) 주소로 replace 가 한 번 더 나간다.
   */
  const urlTopicSurfaceSlug =
    navSelection.kind === "topic"
      ? resolveCommunityFeedSurface(plan.category, "topic").topicSlug ?? ""
      : "";
  useEffect(() => {
    if (!topicAuthorityReady) return;
    if (!urlTopicSurfaceSlug) return;
    if (plan.category === urlTopicSurfaceSlug) return;
    const target = buildCommunityFeedHref(pathname, {
      selection: { kind: "topic", topicSlug: urlTopicSurfaceSlug, allSort: "latest" },
      base: searchQueryString,
    });
    void router.replace(target, { scroll: false });
  }, [
    topicAuthorityReady,
    urlTopicSurfaceSlug,
    plan.category,
    searchQueryString,
    pathname,
    router,
  ]);

  /**
   * Fallback remount without params — restore last nav selection immediately.
   * Bottom-nav entry expands href via `resolveCommunityBottomNavEntryHref` so first paint
   * already has category (no All→topic flash during cover). This path covers soft refresh
   * / deep→hub without going through bottom-nav expand.
   */
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

  const topicOptionsRevisitGate = useHubDataRevisitGate();
  useEffect(() => {
    /** D1 §4 — 허브 보관대에서 다시 보일 때 60초 안이면 주제 목록을 다시 받지 않음 */
    if (topicOptionsRevisitGate.isFresh("topic-options")) return;
    let cancelled = false;
    void (async () => {
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptions();
        if (cancelled) return;
        topicOptionsRevisitGate.markLoaded("topic-options");
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
  }, [topicOptionsRevisitGate]);

  /** UI에서 필터 띠를 끄면 `neighborOnly` 요청도 쓰지 않음(401·불필요 파라미터 제거). */
  useEffect(() => {
    if (showNeighborOnlyStrip) return;
    setNeighborOnly((n) => (n ? false : n));
  }, [showNeighborOnlyStrip]);

  /** D1 §4 — 허브 화면 보관대(`HubRetentionStack`) 재진입 60초 규칙: 같은 인스턴스·같은 조건이면 다시 받지 않음 */
  const feedRevisitGate = useHubDataRevisitGate();
  const topAdsRevisitGate = useHubDataRevisitGate();
  const feedAdPoolRevisitGate = useHubDataRevisitGate();
  const feedAdPoolRefreshAtRef = useRef<number | null>(null);

  const fetchPage = useCallback(
    async (
      nextOffset: number,
      append: boolean,
      session: number,
      showBlockingLoading = true,
      /** PTR — 실패 시 표시 중 목록의 무한 스크롤(hasMore) 유지 */
      keepHasMoreOnFailure = false
    ): Promise<DibayPtrOutcome> => {
      const failHasMore = () => {
        if (!keepHasMoreOnFailure) setHasMore(false);
      };
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
      /** 타임아웃 abort 는 교체 abort 와 구분 — 실패로 보고 (D5) */
      let timedOut = false;
      const timeoutId =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              timedOut = true;
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
            safeT("philife_write_err_region_required")
          );
          setHasMore(false);
          return "error";
        }
        const keysetCursor =
          feedSort === "latest" && append && nextCursorTokenRef.current
            ? nextCursorTokenRef.current
            : null;
        const url = plan.globalFeed
          ? buildPhilifeNeighborhoodFeedClientUrl({
              globalFeed: true,
              category: category || undefined,
              neighborOnly,
              tag: tagFilter || undefined,
              offset: keysetCursor ? 0 : nextOffset,
              cursor: keysetCursor,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: feedSort,
            })
          : buildPhilifeNeighborhoodFeedClientUrl({
              locationKey,
              /** `plan.requiresRegion` 가드가 위에서 이미 통과했으므로 non-null */
              meta: locationMeta!,
              neighborOnly,
              tag: tagFilter || undefined,
              offset: keysetCursor ? 0 : nextOffset,
              cursor: keysetCursor,
              limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
              sort: feedSort,
            });
        const personalized = neighborOnly || viewerSig !== "_anon" || Boolean(tagFilter);
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
          nextCursorToken?: string | null;
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
          if (session !== feedSessionRef.current) return "cancelled";
          setErr(t("community_feed_parse_failed"));
          /* fetch 실패 ≠ 빈 피드 — 세션 캐시·직전 목록 유지 */
          failHasMore();
          return "error";
        }
        if (session !== feedSessionRef.current) return "cancelled";
        if (res.status === 401 && neighborOnly) {
          setErr(t("community_feed_neighbor_login_required"));
          setNeighborOnly(false);
          setLoadingMore(false);
          if (!append) setLoading(false);
          return "error";
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
          failHasMore();
          return "error";
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
          postsContentKeyRef.current = feedContentKey;
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
        nextCursorTokenRef.current =
          typeof j.nextCursorToken === "string" && j.nextCursorToken.trim()
            ? j.nextCursorToken.trim()
            : null;

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
              nextCursorToken: nextCursorTokenRef.current,
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
        return "success";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (!timedOut || session !== feedSessionRef.current) return "cancelled";
          setErr(t("community_feed_load_failed"));
          return "error";
        }
        if (session !== feedSessionRef.current) return "cancelled";
        failHasMore();
        setErr(t("community_feed_load_failed"));
        return "error";
      } finally {
        if (typeof timeoutId === "number") window.clearTimeout(timeoutId);
        if (feedAbortRef.current === controller) {
          feedAbortRef.current = null;
        }
        if (append) {
          setLoadingMore(false);
        } else if (
          communityInitialLoadFinallyClearsLoading({
            append: false,
            requestToken: initialLoadToken,
            currentToken: initialFeedLoadTokenRef.current,
          })
        ) {
          setLoading(false);
        }
      }
    },
    [
      category,
      neighborOnly,
      tagFilter,
      viewerSig,
      feedSort,
      locationKey,
      locationMeta,
      feedSessionKey,
      feedContentKey,
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
        safeT("philife_write_err_region_required")
      );
      postsContentKeyRef.current = feedContentKey;
      setSettledFeedContentKey(feedContentKey);
      return;
    }

    /**
     * D1 §4 — 보관된 허브가 다시 보일 때(같은 질의·60초 안·목록 있음) 목록·오프셋을 되돌리지 않고 다시 받지도 않는다.
     * 새로 마운트된 화면은 기록이 없어 언제나 아래 경로로 받는다.
     */
    if (
      feedRevisitGate.isFresh(`${viewerSig}|${feedContentKey}`) &&
      postsContentKeyRef.current === feedContentKey &&
      postsRef.current.length > 0
    ) {
      return;
    }

    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    nextOffsetRef.current = 0;
    nextCursorTokenRef.current = null;
    loadMoreLockRef.current = false;
    const markFeedLoaded = (outcome: DibayPtrOutcome) => {
      if (outcome === "success" && feedSessionRef.current === session) {
        feedRevisitGate.markLoaded(`${viewerSig}|${feedContentKey}`);
      }
    };

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
      nextCursorTokenRef.current = s.nextCursorToken?.trim() || null;
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
            nextCursorToken: nextCursorTokenRef.current,
          },
          feedSort
        );
      }
      postsContentKeyRef.current = feedContentKey;
      setSettledFeedContentKey(feedContentKey);
      setLoading(false);
      /** Cache/RSC first paint 후 — shellReady 이전 네트워크는 splash hydrate 와 경합하므로 지연 */
      const cancelNetwork = whenAppShellReady(() => {
        void fetchPage(0, false, session, false).then(markFeedLoaded);
      });
      return () => {
        cancelNetwork();
        /** Invalidate token before abort — Abort finally must not clear loading into empty gap. */
        initialFeedLoadTokenRef.current += 1;
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

    const rowsBelongToQuery = postsContentKeyRef.current === feedContentKey;
    if (snapMeta?.posts?.length) {
      setPosts((prev) => patchNeighborhoodFeedRows(prev, snapMeta.posts));
      setHasMore(snapMeta.hasMore);
      nextOffsetRef.current =
        typeof snapMeta.nextOffset === "number" ? snapMeta.nextOffset : 0;
      nextCursorTokenRef.current =
        typeof snapMeta.nextCursorToken === "string" && snapMeta.nextCursorToken.trim()
          ? snapMeta.nextCursorToken.trim()
          : null;
      setErr("");
      setLoading(false);
    } else {
      if (!rowsBelongToQuery) {
        /** 캐시 미스 — 이전 주제·탭의 행을 새 선택 아래 남기지 않고 이 질의의 로딩으로 전환 */
        setPosts([]);
        setHasMore(false);
      }
      setErr("");
    }
    postsContentKeyRef.current = feedContentKey;
    setSettledFeedContentKey(feedContentKey);

    const hasRenderableRows =
      !!snapMeta?.posts?.length || (rowsBelongToQuery && postsRef.current.length > 0);
    /**
     * STATE CLASSIFICATION — cold miss must hold PENDING across whenAppShellReady deferral.
     * Do not leave posts=[] + loading=false (false empty CTA) before fetchPage starts.
     */
    if (communityFeedShouldHoldPendingBeforeDeferredFetch({ hasRenderableRows })) {
      setLoading(true);
    }
    /** hasRenderableRows 면 loading UI 없이 background sync — shellReady 이후 */
    const cancelNetwork = whenAppShellReady(() => {
      void fetchPage(0, false, session, !hasRenderableRows).then(markFeedLoaded);
    });
    return () => {
      cancelNetwork();
      /** Invalidate token before abort — Abort finally must not clear loading into empty gap. */
      initialFeedLoadTokenRef.current += 1;
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
    feedContentKey,
    safeT,
    feedRevisitGate,
  ]);

  const ptrDomain = useMainHubPtrDomain();
  usePhilifePullRefresh(ptrDomain === "philife");

  const onPhilifePullRefresh = useCallback(async (): Promise<DibayPtrOutcome> => {
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
    /* 주제 칩은 부가 갱신 — 결과 판정은 피드 본문 기준 */
    const [feedOutcome] = await Promise.all([fetchPage(0, false, session, false, true), topicRefresh]);
    return feedOutcome;
  }, [category, neighborOnly, tagFilter, viewerSig, feedSort, feedSessionKey, fetchPage]);

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

  /**
   * Owner 2026-11-05 「광고 지역 제한 전면 해제」: 상위노출 선정은 모든 탭에서 지역 값을 보내지 않는다(예전 D-11 폐지).
   */
  const feedNeedsRegionButMissing = plan.requiresRegion && !locationKey;

  // 상단 광고: 피드·주제 칩 이후 유휴 시 로드 (첫 페인트·메인 fetch와 경합 완화)
  useEffect(() => {
    let cancelled = false;
    // 동네 탭인데 지역이 없으면 피드 자체가 「지역 변경」 안내만 보인다 — 광고 자리도 없다
    if (feedNeedsRegionButMissing) {
      setTopAds([]);
      /** 광고를 비웠으니 기록도 지운다 — 60초 안에 다른 탭으로 돌아와도 다시 받게 */
      topAdsRevisitGate.reset();
      return;
    }
    const topAdsKey = category || "all";
    if (topAdsRevisitGate.isFresh(topAdsKey)) return;
    const load = () => {
      runSingleFlight(`community-inline-ad-card:active-plife:${category || "all"}`, () =>
        fetch(`/api/ads/active?boardKey=plife${category ? `&topic=${encodeURIComponent(category)}` : ""}`, {
          credentials: "include",
        })
      )
        .then((r) => r.clone().json())
        .then((j: { ads?: ActiveAdFeedItem[] }) => {
          if (!cancelled && j.ads) {
            setTopAds(j.ads);
            topAdsRevisitGate.markLoaded(topAdsKey);
          }
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
  }, [category, feedNeedsRegionButMissing, topAdsRevisitGate]);

  /** Feed Banner pool — one fetch per surface (slot selection is local). */
  useEffect(() => {
    if (!feedAdSurface.placement) {
      setFeedAdPool(null);
      /** 광고 풀을 비웠으니 기록도 지운다 — 60초 안에 광고 자리가 있는 탭으로 돌아와도 다시 받게 */
      feedAdPoolRevisitGate.reset();
      feedAdPoolRefreshAtRef.current = null;
      return;
    }
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const qs = new URLSearchParams({
      domain: "community",
      placement: feedAdSurface.placement,
      pool: "1",
    });
    if (feedAdSurface.topicSlug) qs.set("topicSlug", feedAdSurface.topicSlug);
    const key = `feed-ad-pool:${qs.toString()}`;
    const gateKey = `${key}:${feedAdPoolTick}`;
    /** D1 §4 — 다시 보일 때 60초 안이면 다시 받지 않고, 서버가 정한 다음 재조회 시각만 다시 건다 */
    if (feedAdPoolRevisitGate.isFresh(gateKey)) {
      const at = feedAdPoolRefreshAtRef.current;
      if (at != null) {
        refreshTimer = setTimeout(
          () => setFeedAdPoolTick((n) => n + 1),
          Math.max(0, at - Date.now())
        );
      }
      return () => {
        if (refreshTimer) clearTimeout(refreshTimer);
      };
    }
    void runSingleFlight(key, async () => {
      const r = await fetch(`/api/feed-ads/active?${qs.toString()}`, {
        credentials: "include",
      });
      return (await r.json()) as { campaigns?: FeedAdPublicCampaign[]; validUntil?: string | null };
    })
      .then((j) => {
        if (cancelled) return;
        setFeedAdPool(Array.isArray(j.campaigns) ? j.campaigns : []);
        feedAdPoolRevisitGate.markLoaded(gateKey);
        const delay = feedAdPoolRefreshDelayMs(j.validUntil);
        feedAdPoolRefreshAtRef.current = delay != null ? Date.now() + delay : null;
        if (delay != null) refreshTimer = setTimeout(() => setFeedAdPoolTick((n) => n + 1), delay);
      })
      .catch(() => {
        if (!cancelled) setFeedAdPool([]);
      });
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [feedAdSurface.placement, feedAdSurface.topicSlug, feedAdPoolTick, feedAdPoolRevisitGate]);

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

  /**
   * 노출 순서 (§F-5-2): 공지·관리자 고정 > 유료 홍보(topAds 위쪽 1개) > 일반 — 계산은 `planCommunityFeedAdPlacement` 하나.
   * 광고 ② PB-21: `topAds` = 광고 중인 글 전체(id) · 위쪽 1개만 카드 값. PB-22: 운영 고정 글도 광고 중이면 표시.
   */
  const { operatorTopPosts, topAdsBelowOperator, activeAdPostIds, postsForList } = useMemo(
    () => planCommunityFeedAdPlacement({ posts, topAds }),
    [posts, topAds]
  );
  const feedPaintQueryKey = `${category.trim().toLowerCase()}\u001f${neighborOnly ? "1" : "0"}\u001f${feedSort}\u001f${tagFilter || ""}`;
  const searchKeyForNav = searchParams.toString();

  /** Nav 선택 단일 진입점 — 상태 갱신 + URL 동기화 + hub state 저장 (Home/Topic/Local/Popular 공통) */
  /**
   * @returns 이동을 시작했으면 true. 같은 선택·이탈 가드 거부면 false (요청 0건).
   *
   * `category` state 는 여기서 바꾸지 않는다 — URL → `plan.category` → layout effect 가 단일 경로.
   * 주소는 Next 가 감싼 `history.replaceState` 로 바꾼다: `/philife` 서버 페이지는 query 를 쓰지 않으므로
   * RSC 왕복이 화면에 주는 것이 없고, 왕복을 기다리면 주제 전환이 네트워크만큼 늦어진다.
   * (Next app-router 가 replaceState 를 ACTION_RESTORE 로 받아 `useSearchParams` 를 동기화한다.)
   */
  const applyNavSelection = useCallback(
    (sel: CommunityNavSelection): boolean => {
      if (isSameCommunityNavSelection(sel, navSelection)) return false;
      if (!guardBeforeNavigate()) return false;
      const target = buildCommunityFeedHref(pathname, { selection: sel, base: searchKeyForNav });
      beginMenuNavigation(target, "community-topic");
      writeCommunityHubState(sel);
      window.history.replaceState(null, "", target);
      return true;
    },
    [
      beginMenuNavigation,
      pathname,
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
            nextCursorToken?: string | null;
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
              nextCursorToken:
                typeof j.nextCursorToken === "string" && j.nextCursorToken.trim()
                  ? j.nextCursorToken.trim()
                  : null,
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

  const { deviceClass } = useDibayAppShellAuthority();
  const feedSwipeOn = deviceClass === "PHONE_ANDROID" || deviceClass === "PHONE_IOS";

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
      ? safeT("community_sort_popular")
      : safeT("community_sort_latest");

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
   * 스와이프로 시작한 이동의 목적지 nav key — 이 이동의 진입은 스와이프 패널(settle 모드)이 소유하므로
   * 아래 탭 진입 애니메이션을 같이 재생하지 않는다. 다음 nav 변경에서 항상 소비된다.
   */
  const swipeNavKeyRef = useRef<string | null>(null);

  /**
   * 주제·동네 탭 선택 시 본문 패널 우→좌 440ms 진입.
   * 최초 마운트·최신순|인기순(all) 전환·스와이프 이동에는 재생하지 않음.
   */
  const prevTopicPanelNavKeyRef = useRef<string | null>(null);
  const [topicPanelEnterId, setTopicPanelEnterId] = useState(0);
  useLayoutEffect(() => {
    const key = communityNavSelectionKey(navSelection);
    const fromSwipe = swipeNavKeyRef.current === key;
    swipeNavKeyRef.current = null;
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
    if (fromSwipe) return;
    setTopicPanelEnterId((n) => n + 1);
  }, [navSelection.kind, navSelection.topicSlug]);

  const swipeToNavItem = useCallback(
    (item: CommunityNavComposeItem): boolean => {
      const sel = communityNavComposeItemToSelection(item);
      swipeNavKeyRef.current = communityNavSelectionKey(sel);
      const started = applyNavSelection(sel);
      if (!started) swipeNavKeyRef.current = null;
      return started;
    },
    [applyNavSelection]
  );

  const swipeToNextTab = useCallback((): boolean => {
    if (!navItems.length) return false;
    const i = activeTopicTabIndex;
    if (i < navItems.length - 1) {
      return swipeToNavItem(navItems[i + 1]!);
    }
    /** 정보교환 마지막 주제 다음 = 같은 커뮤니티 탭 안의 「거래」 (2026-11-09) */
    const href = "/market";
    if (!guardBeforeNavigate()) return false;
    void router.push(href, { scroll: false });
    return true;
  }, [navItems, activeTopicTabIndex, swipeToNavItem, router, guardBeforeNavigate]);

  const swipeToPrevTab = useCallback((): boolean => {
    if (!navItems.length) return false;
    const i = activeTopicTabIndex;
    if (i <= 0) return false;
    return swipeToNavItem(navItems[i - 1]!);
  }, [navItems, activeTopicTabIndex, swipeToNavItem]);

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
    settleKey: settledFeedContentKey,
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
      const nextBottomHref = "/market";
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
        /** D1 §4 — 인접 주제 미리 받기도 60초 규칙(보관된 허브가 다시 보일 때 반복 방지) */
        if (now - last < HUB_DATA_REVISIT_FRESH_MS) continue;
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
              nextCursorToken?: string | null;
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
                nextCursorToken:
                  typeof j.nextCursorToken === "string" && j.nextCursorToken.trim()
                    ? j.nextCursorToken.trim()
                    : null,
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
    const nextBottomHref = "/market";
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
            <DibaySecondaryTabRow
              ref={topicTablistRef}
              navRole="category"
              tier="section"
              bordered
              leading={
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
                  className={`${dibaySecondaryTabClass(allSortOn)} inline-flex shrink-0 items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]`}
                >
                  <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{allSortLabel}</span>
                  {allSortOpen ? (
                    <ChevronUp
                      className={DIBAY_SECONDARY_TAB_CHEVRON_CLASS}
                      strokeWidth={2.4}
                      aria-hidden
                    />
                  ) : (
                    <ChevronDown
                      className={DIBAY_SECONDARY_TAB_CHEVRON_CLASS}
                      strokeWidth={2.4}
                      aria-hidden
                    />
                  )}
                </button>
              }
              trackAriaLabel={t("community_feed_topic_aria")}
            >
              {leadingNavItems.map((item) => {
                const on = navSelection.kind === "topic" && navSelection.topicSlug === item.slug;
                const chipLabel = resolveCommunityTopicUILabel(
                  language,
                  item.label,
                  item.name_en,
                  item.slug
                );
                return (
                  <button
                    key={item.slug}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() =>
                      applyNavSelection({ kind: "topic", topicSlug: item.slug, allSort: "latest" })
                    }
                    onMouseEnter={() => prefetchNavItemByIntent(item)}
                    onTouchStart={() => prefetchNavItemByIntent(item)}
                    onPointerDown={() => prefetchNavItemByIntent(item)}
                    onFocus={() => prefetchNavItemByIntent(item)}
                    className={dibaySecondaryTabClass(on)}
                  >
                    <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{chipLabel}</span>
                  </button>
                );
              })}
              {!chipsLoadDone ? (
                <span
                  className="flex shrink-0 items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]"
                  aria-hidden
                >
                  <span className="h-8 w-14 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                  <span className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-sam-muted/25" />
                </span>
              ) : null}
              {trailingNavItems.map((item) => {
                const on = navSelection.kind === "local";
                const label = safeT("community_feed_mode_local");
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
                    className={dibaySecondaryTabClass(on)}
                  >
                    <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{label}</span>
                  </button>
                );
              })}
            </DibaySecondaryTabRow>
            {navSelection.kind === "local" ? (
              <div className={`${PHILIFE_FEED_FILTER_STRIP_CLASS} border-t-0`}>
                <div className={`flex min-w-0 items-center justify-between gap-2 ${APP_MAIN_HEADER_INNER_CLASS}`}>
                  <p className="min-w-0 truncate sam-text-body-secondary text-sam-muted">
                    {safeT("community_local_filter_active")}
                    {filterLabel.trim() ? ` · ${filterLabel.trim()}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLocalFilterPickerOpen(true)}
                    className="shrink-0 sam-text-body font-semibold text-sam-primary"
                  >
                    {safeT("community_local_filter_change")}
                  </button>
                </div>
              </div>
            ) : null}
            {allSortOpen && allSortMenuPos && typeof document !== "undefined"
              ? createPortal(
                  <ul
                    ref={allSortMenuRef}
                    role="listbox"
                    aria-label={t("community_feed_all_sort_menu_aria")}
                    className="min-w-[10rem] max-w-[min(92vw,280px)] overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[color:var(--overlay-text-primary)] shadow-[var(--overlay-elevation-2)]"
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
                          label: safeT("community_sort_latest"),
                        },
                        {
                          key: "popular" as const,
                          label: safeT("community_sort_popular"),
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
                            className={OverlayUi.popoverItem}
                            style={
                              selected
                                ? { color: "var(--overlay-primary)", fontWeight: 600 }
                                : undefined
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
            {tagFilter ? (
              <div className={PHILIFE_FEED_FILTER_STRIP_CLASS}>
                <div className={`flex min-w-0 items-center justify-between gap-3 ${APP_MAIN_HEADER_INNER_CLASS}`}>
                  <p className="min-w-0 truncate text-[14px] font-medium text-sam-fg">
                    {t("community_feed_hashtag_active", { tag: tagFilter })}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-[13px] font-semibold text-sam-primary"
                    onClick={clearTagFilter}
                  >
                    {t("community_feed_hashtag_clear")}
                  </button>
                </div>
              </div>
            ) : null}
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

        {operatorTopPosts.length > 0 ? (
          <ul className={COMMUNITY_FEED_LIST_WRAP_CLASS} data-community-operator-top="1">
            {operatorTopPosts.map((p, index) => (
              <li key={p.id} className="list-none">
                {/* 광고 ② PB-22: 운영 고정 글도 광고 중이면 운영 고정 칩 + 「포인트 노출」 둘 다 */}
                <CommunityCard
                  post={p}
                  priorityThumb={index < FEED_LCP_PRIORITY_COUNT}
                  isAd={activeAdPostIds.has(String(p.id))}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {/* 커뮤니티 상위노출 표시 재설계 (Owner 2026-11-04 「배경 + 글자」): 위쪽 고정 글도 일반 글과 같은 카드
            (작성자·지역·조회수·댓글·사진·시간) · 상위노출 배경 + 「포인트 노출」 · 남은 기간은 보이지 않는다(작성자 본인만 결제 창·마이 › 광고) */}
        {topAdsBelowOperator.length > 0 ? (
          <ul className={COMMUNITY_FEED_LIST_WRAP_CLASS} data-community-boost-top="1">
            {topAdsBelowOperator.map((ad, index) => (
              <li key={ad.adId} className="list-none">
                <CommunityCard post={ad.feedPost!} priorityThumb={index < FEED_LCP_PRIORITY_COUNT} isAd />
              </li>
            ))}
          </ul>
        ) : null}

        {/* CUT 2 — COMMUNITY_HOME × HERO host (capability registry). Collapses when empty. */}
        {feedAdSurface.placement === "COMMUNITY_HOME" ? (
          <div className="px-4 pb-2 empty:hidden" data-community-event-hero-host="1">
            <EventPromotionHeroBanner placement="COMMUNITY_HOME" />
          </div>
        ) : null}

        {err ? (
          <div className="px-4 py-3">
            <div className="rounded-ui-rect border border-amber-200/90 bg-amber-50 px-4 py-3 text-[14px] text-amber-950">
              {err}
              {plan.requiresRegion && !locationKey ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setLocalFilterPickerOpen(true)}
                    className="font-semibold text-sam-primary underline decoration-sam-primary/40 underline-offset-2"
                  >
                    {safeT("community_local_filter_change")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {loading && postsForList.length === 0 && !err ? (
          <CommunityFeedSkeleton rows={5} />
        ) : communityFeedShouldShowEmptyCta({
            hasError: Boolean(err),
            loading,
            postCount: postsForList.length + operatorTopPosts.length,
          }) ? (
          <div className={`${APP_MAIN_GUTTER_X_CLASS} py-12 text-center text-[14px] text-sam-muted`}>
            {tagFilter ? t("community_feed_hashtag_empty", { tag: tagFilter }) : t("community_feed_empty")}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => openPhilifeWriteSheet(category)}
                className="font-semibold text-sam-primary underline decoration-sam-primary/40 underline-offset-2"
              >
                {t("community_first_post_cta")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ul ref={listRootRef} className={`${COMMUNITY_FEED_LIST_WRAP_CLASS} ${topAds.length > 0 ? "mt-1" : ""}`}>
              {postsForList.map((p, index) => (
                <Fragment key={p.id}>
                  {/* D1 F2 (2026-11-11): 화면 밖 글 칸은 스타일·배치 계산을 건너뜀 — `app/samarket-components.css` */}
                  <li className="list-none flow-root">
                    {/* D1 F2 — 화면 밖 계산 건너뛰기 칸. 카드 그림자가 잘리지 않게 칸을 그림자만큼 넓힌다(app/samarket-components.css) */}
                    <div data-community-feed-cv-row="">
                      <CommunityCard
                        post={p}
                        priorityThumb={index < FEED_LCP_PRIORITY_COUNT}
                        isAd={activeAdPostIds.has(String(p.id))}
                      />
                    </div>
                  </li>
                  {feedAdSurface.placement &&
                  !feedSearchActive &&
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
      <CommunityLocalFilterPickerSheet
        open={localFilterPickerOpen}
        onClose={() => setLocalFilterPickerOpen(false)}
        initialLguId={filter?.lguId ?? ""}
        onApply={(lguId) => {
          setExplicitFilter(lguId);
        }}
      />
    </div>
  );
}
