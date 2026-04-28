"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories, getChildCategoriesForFeedFilter } from "@/lib/categories/getChildCategories";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { TradeTopicChipsRow } from "@/components/home/TradeTopicChipsRow";
import { PostListByCategory } from "@/components/post/PostListByCategory";
import { sortKeyToHomePostSort } from "@/lib/constants/sort";
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

/**
 * 마켓 2행 주제 칩 — `categories.parent_id = 이 메뉴 id` 인 하위만 표시.
 * (`/admin/trade/feed-topics` · TradeSubtopicsPanel 과 동일 소스. 하위가 없으면 2행 숨김)
 */

type FeedFilterChild = { id: string; slug: string | null };

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
  const initialPrewarmDoneRef = useRef(false);
  const { tabs, activeIndex } = useTradeTabs(pathname);
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
  const postSort = sortKeyToHomePostSort("latest");
  const feedKey = useMemo(() => {
    return computeTradeFeedKeyForMarketParent(category.id, topicRaw, postSort);
  }, [category.id, topicRaw, postSort]);
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
  }, [tabs, activeIndex, router, postSort]);

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

  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const targets = new Set<string>();
      const nextTabHref = tabs[activeIndex + 1]?.href;
      const prevTabHref = tabs[activeIndex - 1]?.href;
      if (nextTabHref) targets.add(nextTabHref);
      if (prevTabHref) targets.add(prevTabHref);
      const edgeNext = resolveTradeSwipeTarget(tabs, activeIndex, "next");
      const edgePrev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
      if (edgeNext) targets.add(edgeNext);
      if (edgePrev) targets.add(edgePrev);
      for (const href of targets) {
        void router.prefetch(href);
      }
    }, 300);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [tabs, activeIndex, router]);

  /** `/market/*` 스와이프 시 다음 화면의 RSC 준비를 idle 전 즉시 시작한다. */
  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const next = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    const prev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    if (next) void router.prefetch(next);
    if (prev) void router.prefetch(prev);
    const prewarmTradeSurfaceHref = (href: string) => {
      const pathOnly = (href.split("?")[0] ?? "").trim();
      if (!pathOnly) return;
      if (pathOnly === "/market") {
        /** /market 루트는 HomeProductList(getPostsForHome) 캐시를 먼저 채워 즉시 리스트 렌더를 유도 */
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
    if (next) prewarmTradeSurfaceHref(next);
    if (prev) prewarmTradeSurfaceHref(prev);
  }, [tabs, activeIndex, router]);

  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const neighborKeys: string[] = [];
      const next = tabs[activeIndex + 1];
      const prev = tabs[activeIndex - 1];
      if (next && next.key !== "all") neighborKeys.push(next.key);
      if (prev && prev.key !== "all") neighborKeys.push(prev.key);
      for (const parentCategoryId of neighborKeys) {
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
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [tabs, activeIndex, postSort]);

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
      void getPostsByTradeCategoryIds([], {
        page: 1,
        sort: postSort,
        tradeMarketParent: category.id,
        topic,
      });
    },
    [category.id, postSort]
  );

  useEffect(() => {
    if (children.length === 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (initialPrewarmDoneRef.current) return;
    initialPrewarmDoneRef.current = true;
    const initialTargets = children
      .map((c) => (c.slug?.trim() || c.id).normalize("NFC"))
      .filter(Boolean)
      .slice(0, 3);
    for (const key of initialTargets) {
      prefetchTopicFeed(key);
    }
  }, [children, prefetchTopicFeed]);

  useEffect(() => {
    if (children.length === 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const selectedIndex = children.findIndex((c) => {
      const slug = c.slug?.trim().normalize("NFC");
      return (slug && slug === topicRaw) || c.id === topicRaw;
    });
    const center = selectedIndex >= 0 ? selectedIndex : 0;
    const immediateTargets = children
      .map((c, index) => ({ key: (c.slug?.trim() || c.id).normalize("NFC"), dist: Math.abs(index - center) }))
      .filter((item) => item.key && item.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    for (const item of immediateTargets) {
      prefetchTopicFeed(item.key);
    }
  }, [children, topicRaw, prefetchTopicFeed]);

  useEffect(() => {
    if (children.length === 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const selectedIndex = children.findIndex((c) => {
      const slug = c.slug?.trim().normalize("NFC");
      return (slug && slug === topicRaw) || c.id === topicRaw;
    });
    const center = selectedIndex >= 0 ? selectedIndex : 0;
    const ordered = children
      .map((c, index) => ({ key: (c.slug?.trim() || c.id).normalize("NFC"), dist: Math.abs(index - center) }))
      .filter((item) => item.key && item.dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    const idleId = scheduleWhenBrowserIdle(() => {
      for (const item of ordered) {
        prefetchTopicFeed(item.key);
      }
    }, 120);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [children, topicRaw, prefetchTopicFeed]);
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
    if (!topicBlock) return null;

    return (
      <div className={TRADE_SECONDARY_TABS_SHELL_CLASS}>
        <div className="flex w-full min-w-0 flex-col">
          {topicBlock}
        </div>
      </div>
    );
  }, [children, marketBase, topicKeyForChips]);

  const tradeSecondaryTabsSyncKey = useMemo(
    () =>
      `${category.id}\u0000${topicKeyForChips ?? ""}\u0000${children.map((c) => c.id).join(",")}`,
    [category.id, topicKeyForChips, children]
  );

  useRegisterTradeSecondaryTabs(children.length > 0, secondaryHeaderNode, tradeSecondaryTabsSyncKey);

  const postsTopGapClass =
    children.length > 0 ? TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS : TRADE_GAP_MENU_TO_POSTS_CLASS;

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
          initialTradeFeed={initialTradeFeed}
        />
      </div>
    </div>
  );
}
