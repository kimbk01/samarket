"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories, getChildCategoriesForFeedFilter } from "@/lib/categories/getChildCategories";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { TradeTopicChipsRow } from "@/components/home/TradeTopicChipsRow";
import { PostListByCategory } from "@/components/post/PostListByCategory";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import {
  JOB_WORK_TYPE_OPTIONS,
  WORK_TERM_LABELS,
} from "@/lib/jobs/form-options";
import { JOB_EMPLOYMENT_FILTER_VALUES } from "@/lib/jobs/job-employment-filter";
import type { TradeFeedClientSort } from "@/lib/posts/trade-feed-client-cache";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import {
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { TRADE_SECONDARY_TABS_SHELL_CLASS } from "@/lib/trade/ui/secondary-tabs-surface";
import {
  TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS,
  TRADE_GAP_MENU_TO_POSTS_CLASS,
} from "@/lib/trade/ui/post-spacing";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { TRADE_CONTENT_SHELL_CLASS } from "@/lib/trade/ui/content-shell";
import { useRegisterTradeSecondaryTabs } from "@/contexts/CategoryListHeaderContext";
import { Sam } from "@/lib/ui/sam-component-classes";
import { computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getPostsByTradeCategoryIds, peekCachedTradeFeed } from "@/lib/posts/getPostsByCategory";
import { getPostsForHome, peekCachedPostsForHome } from "@/lib/posts/getPostsForHome";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { resolveTradeSwipeTarget } from "@/lib/trade/swipe/resolve-trade-swipe-target";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import { capRecordByOldestTimestamps } from "@/lib/http/memory-map-prune";

/**
 * 마켓 2행 주제 칩 — `categories.parent_id = 이 메뉴 id` 인 하위만 표시.
 * (`/admin/trade/feed-topics` · TradeSubtopicsPanel 과 동일 소스. 하위가 없으면 2행 숨김)
 */

type FeedFilterChild = { id: string; slug: string | null };

const TOPIC_PREFETCH_TS_MAX_KEYS = 80;

export function MarketCategoryFeed({
  category,
  initialChildren,
  initialChildrenForFilter,
  bootstrapFeed,
}: {
  category: CategoryWithSettings;
  /** `/api/categories/market-bootstrap` 로 이미 받은 2행 주제 — 추가 왕복 생략 */
  initialChildren?: CategoryWithSettings[] | null;
  /** 직계 활성 하위 전체 id/slug — 피드 필터 전용(칩 목록과 다를 수 있음). 미주입 시 클라이언트에서 조회 */
  initialChildrenForFilter?: FeedFilterChild[] | null;
  /** bootstrap 첫 페이지 글(키가 현재 필터와 일치할 때만 목록에 사용) */
  bootstrapFeed?: {
    posts: PostWithMeta[];
    hasMore: boolean;
    feedKey: string;
    favoriteMap?: Record<string, boolean>;
  } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicRaw = (searchParams.get("topic")?.trim() ?? "").normalize("NFC");
  const [children, setChildren] = useState<CategoryWithSettings[]>(() => initialChildren ?? []);
  /** null = 아직 로드 전 · [] = 직계 하위 없음(부모 id 만 필터) */
  const [filterRows, setFilterRows] = useState<FeedFilterChild[] | null>(() =>
    initialChildrenForFilter !== undefined ? initialChildrenForFilter : null
  );
  const topicPrefetchAtRef = useRef<Record<string, number>>({});
  /** 선두 3칩 프리워밍은 카테고리 id 단위로만 1회(Strict Mode 이중 마운트·불리언 플래그 누락 방지) */
  const headTopicPrewarmedCategoryIdRef = useRef<string | null>(null);
  const { tabs, activeIndex } = useTradeTabs(pathname);

  useEffect(() => {
    topicPrefetchAtRef.current = {};
  }, [category.id]);
  const feedSwipeableRef = useRef<HTMLDivElement | null>(null);
  const [feedSwipeOn, setFeedSwipeOn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setFeedSwipeOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setChildren(initialChildren ?? []);
  }, [category.id, initialChildren]);

  useEffect(() => {
    if (initialChildrenForFilter !== undefined) {
      setFilterRows(initialChildrenForFilter ?? null);
    }
  }, [category.id, initialChildrenForFilter]);

  /** 부트스트랩 없을 때만 Supabase — 칩·필터 id 를 한 번에 채워 이중 왕복을 줄임 */
  useEffect(() => {
    if (initialChildren !== undefined && initialChildrenForFilter !== undefined) return;

    let cancelled = false;
    void (async () => {
      const needChildren = initialChildren === undefined;
      const needFilter = initialChildrenForFilter === undefined;
      if (!needChildren && !needFilter) return;

      if (needChildren && needFilter) {
        const [a, b] = await Promise.allSettled([
          getChildCategories(category.id),
          getChildCategoriesForFeedFilter(category.id),
        ]);
        if (cancelled) return;
        if (a.status === "fulfilled") setChildren(a.value);
        if (b.status === "fulfilled") setFilterRows(b.value);
        else setFilterRows([]);
        return;
      }
      if (needChildren) {
        try {
          const list = await getChildCategories(category.id);
          if (!cancelled) setChildren(list);
        } catch {
          /* 기존과 동일 — 칩 실패는 미처리 */
        }
      }
      if (needFilter) {
        try {
          const filterList = await getChildCategoriesForFeedFilter(category.id);
          if (cancelled) return;
          setFilterRows(filterList);
        } catch {
          if (!cancelled) setFilterRows([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [category.id, initialChildren, initialChildrenForFilter]);

  /** 칩 하이라이트: topic 은 피드 풀(activeChildren) 기준으로 유효할 때만 */
  const topicKeyForChips = useMemo(() => {
    if (!topicRaw || filterRows === null) return null;
    const match = filterRows.find((c) => {
      const slug = c.slug?.trim().normalize("NFC");
      return (slug && slug === topicRaw) || c.id === topicRaw;
    });
    return match ? topicRaw : null;
  }, [filterRows, topicRaw]);

  const marketBase = `/market/${encodedTradeMarketSegment(category)}`;

  const iconKey = category.icon_key?.trim() ?? "";
  const slugCat = category.slug?.trim().toLowerCase() ?? "";
  const isJobsMarket = iconKey === "jobs" || iconKey === "job" || slugCat === "job";

  const fsRaw = searchParams.get("fs")?.trim().toLowerCase() ?? "";
  const postSort: TradeFeedClientSort =
    fsRaw === "popular" ? "popular" : fsRaw === "pay_desc" ? "pay_desc" : "latest";

  const jeRaw = searchParams.get("je")?.trim().toLowerCase() ?? "";
  const jobEmploymentType = (JOB_EMPLOYMENT_FILTER_VALUES as readonly string[]).includes(jeRaw)
    ? jeRaw
    : undefined;

  const todayAvailable = searchParams.get("avail") === "1";

  const jkRaw = searchParams.get("jk")?.trim().toLowerCase() ?? "";
  const jobsListingKind: JobListingKindFilter | undefined = isJobsMarket
    ? jkRaw === "work"
      ? "work"
      : "hire"
    : undefined;

  const patchMarketQuery = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") q.delete(k);
        else q.set(k, v);
      }
      const s = q.toString();
      void router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const feedKey = useMemo(() => {
    return computeTradeFeedKeyForMarketParent(category.id, topicRaw, postSort, jobsListingKind, {
      jobEmploymentType,
      todayAvailable,
    });
  }, [category.id, topicRaw, postSort, jobsListingKind, jobEmploymentType, todayAvailable]);
  const initialTradeFeed =
    bootstrapFeed && feedKey && bootstrapFeed.feedKey === feedKey ? bootstrapFeed : null;

  const canSwipeNext = useMemo(
    () => resolveTradeSwipeTarget(tabs, activeIndex, "next") != null,
    [tabs, activeIndex]
  );
  const canSwipePrev = useMemo(
    () => resolveTradeSwipeTarget(tabs, activeIndex, "prev") != null,
    [tabs, activeIndex]
  );

  const swipeToNext = useCallback(() => {
    const href = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    if (href) void router.push(href, { scroll: false });
  }, [tabs, activeIndex, router]);

  const swipeToPrev = useCallback(() => {
    const href = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    if (href) void router.push(href, { scroll: false });
  }, [tabs, activeIndex, router]);

  const { setSwipeableEl: setMarketFeedSwipeable } = useMobileHorizontalSwipePanel({
    enabled: feedSwipeOn,
    swipeableRef: feedSwipeableRef,
    onCommitNext: swipeToNext,
    onCommitPrev: swipeToPrev,
    canGoNext: canSwipeNext,
    canGoPrev: canSwipePrev,
  });

  /**
   * 인접 탭·스와이프: 즉시 `router.prefetch` + URL 기반 피드 선채움,
   * 탭 key 기반 이웃 카테고리 피드는 idle(380ms)로 한 묶음 정리·취소.
   */
  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    let cancelled = false;

    /** 즉시 prewarm 한 부모 id — idle 단계에서 탭 key 와 중복 요청 방지 */
    const tradeParentsWarmedFromHref = new Set<string>();

    const targets = new Set<string>();
    const nextTabHref = tabs[activeIndex + 1]?.href;
    const prevTabHref = tabs[activeIndex - 1]?.href;
    if (nextTabHref) targets.add(nextTabHref);
    if (prevTabHref) targets.add(prevTabHref);
    const edgeNext = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    const edgePrev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    if (edgeNext) targets.add(edgeNext);
    if (edgePrev) targets.add(edgePrev);

    const prewarmTradeSurfaceHref = (href: string) => {
      const pathOnly = (href.split("?")[0] ?? "").trim();
      if (!pathOnly) return;
      if (pathOnly === "/market") {
        const homeHit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
        if (!homeHit?.posts?.length) {
          void getPostsForHome({ page: 1, sort: "latest", type: null, tradeState: "latest" });
        }
        return;
      }
      const m = pathOnly.match(/^\/market\/([^/]+)$/);
      if (!m) return;
      let parent = m[1]!;
      try {
        parent = decodeURIComponent(parent);
      } catch {
        /* noop */
      }
      const parentNorm = parent.normalize("NFC");
      tradeParentsWarmedFromHref.add(parentNorm);
      const hit = peekCachedTradeFeed([], {
        page: 1,
        sort: postSort,
        tradeMarketParent: parent,
        topic: "",
      });
      if (!hit?.posts?.length) {
        void getPostsByTradeCategoryIds([], {
          page: 1,
          sort: postSort,
          tradeMarketParent: parent,
          topic: "",
        });
      }
    };

    for (const href of targets) {
      void router.prefetch(href);
      prewarmTradeSurfaceHref(href);
    }

    const idleId = scheduleWhenBrowserIdle(() => {
      if (cancelled) return;
      const neighborKeys: string[] = [];
      const next = tabs[activeIndex + 1];
      const prev = tabs[activeIndex - 1];
      if (next && next.key !== "all") neighborKeys.push(next.key);
      if (prev && prev.key !== "all") neighborKeys.push(prev.key);
      for (const parentCategoryId of neighborKeys) {
        const pid = parentCategoryId.trim().normalize("NFC");
        if (tradeParentsWarmedFromHref.has(pid)) continue;
        const hit = peekCachedTradeFeed([], {
          page: 1,
          sort: postSort,
          tradeMarketParent: parentCategoryId,
          topic: "",
        });
        if (hit?.posts?.length) continue;
        void getPostsByTradeCategoryIds([], {
          page: 1,
          sort: postSort,
          tradeMarketParent: parentCategoryId,
          topic: "",
        });
      }
    }, 380);

    return () => {
      cancelled = true;
      cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [tabs, activeIndex, router, postSort]);

  const prefetchTopicFeed = useCallback(
    (topicKey: string) => {
      const topic = topicKey.trim();
      if (!topic) return;
      if (isConstrainedNetwork()) return;
      const cacheHit = peekCachedTradeFeed([], {
        page: 1,
        sort: postSort,
        tradeMarketParent: category.id,
        topic,
      });
      if (cacheHit?.posts?.length) return;
      const now = Date.now();
      const throttleKey = `${category.id}\u001f${topic}\u001f${postSort}`;
      const last = topicPrefetchAtRef.current[throttleKey] ?? 0;
      if (now - last < 10_000) return;
      topicPrefetchAtRef.current[throttleKey] = now;
      capRecordByOldestTimestamps(topicPrefetchAtRef.current, TOPIC_PREFETCH_TS_MAX_KEYS);
      void getPostsByTradeCategoryIds([], {
        page: 1,
        sort: postSort,
        tradeMarketParent: category.id,
        topic,
      });
    },
    [category.id, postSort]
  );

  /**
   * 주제 칩 피드 프리패치 단일 경로: 카테고리당 1회 칩 선두 3개 + 선택 기준 인접 2개 즉시 + 인접 3개 idle.
   * (이전 3분할 effect 중복·정리 비용 제거)
   */
  useEffect(() => {
    if (children.length === 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    let cancelled = false;

    if (headTopicPrewarmedCategoryIdRef.current !== category.id) {
      const headKeys = children
        .map((c) => (c.slug?.trim() || c.id).normalize("NFC"))
        .filter(Boolean)
        .slice(0, 3);
      if (headKeys.length === 0) {
        headTopicPrewarmedCategoryIdRef.current = category.id;
      } else {
        for (const key of headKeys) {
          if (cancelled) return;
          prefetchTopicFeed(key);
        }
        if (!cancelled) {
          headTopicPrewarmedCategoryIdRef.current = category.id;
        }
      }
    }

    const selectedIndex = children.findIndex((c) => {
      const slug = c.slug?.trim().normalize("NFC");
      return (slug && slug === topicRaw) || c.id === topicRaw;
    });
    const center = selectedIndex >= 0 ? selectedIndex : 0;
    const keysByProximity = children
      .map((c, index) => ({
        key: (c.slug?.trim() || c.id).normalize("NFC"),
        dist: Math.abs(index - center),
      }))
      .filter((item) => item.key && item.dist > 0)
      .sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.key.localeCompare(b.key)));

    for (const row of keysByProximity.slice(0, 2)) {
      if (cancelled) return;
      prefetchTopicFeed(row.key);
    }

    const idleKeys = keysByProximity.slice(0, 3).map((r) => r.key);
    const idleId = scheduleWhenBrowserIdle(() => {
      if (cancelled) return;
      for (const key of idleKeys) {
        prefetchTopicFeed(key);
      }
    }, 120);

    return () => {
      cancelled = true;
      cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [children, topicRaw, prefetchTopicFeed, category.id]);

  const secondaryHeaderNode = useMemo(() => {
    const topicBlock =
      children.length > 0 ? (
        <div className={APP_MAIN_HEADER_INNER_CLASS}>
          <HorizontalDragScroll
            className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
            style={{ WebkitOverflowScrolling: "touch" }}
            role="tablist"
            aria-label="주제 필터"
          >
            <TradeTopicChipsRow
              marketBasePath={marketBase}
              topics={children}
              selectedTopicKey={topicKeyForChips}
              onTopicIntent={prefetchTopicFeed}
            />
          </HorizontalDragScroll>
        </div>
      ) : null;
    const jobsFilters =
      isJobsMarket ? (
        <div className={`${APP_MAIN_HEADER_INNER_CLASS} flex w-full min-w-0 flex-col gap-2 pb-1 pt-1`}>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "latest" as const, label: "최신" },
                { key: "popular" as const, label: "인기" },
                { key: "pay_desc" as const, label: "급여순" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => patchMarketQuery({ fs: key === "latest" ? null : key })}
                className={postSort === key ? Sam.chip.activeCombo : Sam.chip.neutral}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => patchMarketQuery({ jk: null })}
              className={jobsListingKind !== "work" ? Sam.chip.activeCombo : Sam.chip.neutral}
            >
              구인
            </button>
            <button
              type="button"
              onClick={() => patchMarketQuery({ jk: "work" })}
              className={jobsListingKind === "work" ? Sam.chip.activeCombo : Sam.chip.neutral}
            >
              구직
            </button>
            <button
              type="button"
              onClick={() => patchMarketQuery({ avail: todayAvailable ? null : "1" })}
              className={todayAvailable ? Sam.chip.activeCombo : Sam.chip.neutral}
            >
              오늘 가능
            </button>
          </div>
          <HorizontalDragScroll
            className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
            style={{ WebkitOverflowScrolling: "touch" }}
            role="tablist"
            aria-label="근무 형태"
          >
            <div className="flex w-max min-w-0 flex-nowrap items-center gap-1.5 px-0.5">
              <button
                type="button"
                onClick={() => patchMarketQuery({ je: null })}
                className={!jobEmploymentType ? Sam.chip.activeCombo : Sam.chip.neutral}
              >
                형태 전체
              </button>
              {JOB_WORK_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => patchMarketQuery({ je: o.value })}
                  className={jobEmploymentType === o.value ? Sam.chip.activeCombo : Sam.chip.neutral}
                >
                  {o.label}
                </button>
              ))}
              {(
                [
                  { value: "month_plus" as const, label: WORK_TERM_LABELS.month_plus },
                  { value: "fulltime" as const, label: WORK_TERM_LABELS.fulltime },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patchMarketQuery({ je: value })}
                  className={jobEmploymentType === value ? Sam.chip.activeCombo : Sam.chip.neutral}
                >
                  {label}
                </button>
              ))}
            </div>
          </HorizontalDragScroll>
        </div>
      ) : null;

    if (!topicBlock && !jobsFilters) return null;

    return (
      <div className={TRADE_SECONDARY_TABS_SHELL_CLASS}>
        <div className="flex w-full min-w-0 flex-col">
          {topicBlock}
          {jobsFilters}
        </div>
      </div>
    );
  }, [
    children,
    marketBase,
    topicKeyForChips,
    isJobsMarket,
    patchMarketQuery,
    postSort,
    jobsListingKind,
    todayAvailable,
    jobEmploymentType,
  ]);

  const tradeSecondaryTabsSyncKey = useMemo(
    () =>
      `${category.id}\u0000${topicKeyForChips ?? ""}\u0000${children.map((c) => c.id).join(",")}\u0000${postSort}\u0000${jobsListingKind ?? ""}\u0000${jobEmploymentType ?? ""}\u0000${todayAvailable ? "1" : ""}`,
    [
      category.id,
      topicKeyForChips,
      children,
      postSort,
      jobsListingKind,
      jobEmploymentType,
      todayAvailable,
    ]
  );

  const hasSecondaryBar = children.length > 0 || isJobsMarket;
  useRegisterTradeSecondaryTabs(hasSecondaryBar, secondaryHeaderNode, tradeSecondaryTabsSyncKey);

  const postsTopGapClass =
    hasSecondaryBar ? TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS : TRADE_GAP_MENU_TO_POSTS_CLASS;

  return (
    <div
      ref={setMarketFeedSwipeable}
      className="will-change-transform touch-pan-y min-w-0 w-full max-w-full"
    >
      <div className={`${TRADE_CONTENT_SHELL_CLASS} ${postsTopGapClass}`}>
        <PostListByCategory
          categoryId={category.id}
          tradeFeedServerResolution
          tradeTopicParam={topicRaw}
          category={category}
          sort={postSort}
          jobsListingKind={jobsListingKind}
          jobEmploymentType={jobEmploymentType}
          todayAvailable={todayAvailable}
          initialTradeFeed={initialTradeFeed}
        />
      </div>
    </div>
  );
}
