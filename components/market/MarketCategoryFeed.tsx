"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { useRegisterTradeSecondaryTabs } from "@/contexts/CategoryListHeaderContext";
import { Sam } from "@/lib/ui/sam-component-classes";
import { JobListingKindTabs, type JobListingKindTab } from "@/components/market/JobListingKindTabs";
import { computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import type { PostWithMeta } from "@/lib/posts/schema";

function parseJobListingKindParam(raw: string | null): JobListingKindTab {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "work" ? "work" : "hire";
}

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
  const jobKindTab = parseJobListingKindParam(searchParams.get("jk"));
  const [children, setChildren] = useState<CategoryWithSettings[]>(() => initialChildren ?? []);
  /** null = 아직 로드 전 · [] = 직계 하위 없음(부모 id 만 필터) */
  const [filterRows, setFilterRows] = useState<FeedFilterChild[] | null>(() =>
    initialChildrenForFilter !== undefined ? initialChildrenForFilter : null
  );
  const { tabs, activeIndex } = useTradeTabs(pathname);

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
  const isJobMarket =
    category.icon_key === "job" || category.icon_key === "jobs" || category.slug === "job";
  const postSort = sortKeyToHomePostSort("latest");
  const feedKey = useMemo(() => {
    if (filterRows === null) return "";
    return computeTradeFeedKeyForMarketParent(
      category.id,
      topicRaw,
      postSort,
      isJobMarket ? jobKindTab : undefined
    );
  }, [filterRows, category.id, topicRaw, postSort, isJobMarket, jobKindTab]);
  const initialTradeFeed =
    bootstrapFeed && feedKey && bootstrapFeed.feedKey === feedKey ? bootstrapFeed : null;
  const onNavigate = useCallback(
    (href: string) => {
      router.push(href, { scroll: false });
    },
    [router]
  );
  const { onTouchStart, onTouchEnd } = useSwipeTabNavigation(tabs, activeIndex, onNavigate);
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
              extraQuery={isJobMarket ? { jk: jobKindTab } : undefined}
            />
          </HorizontalDragScroll>
        </div>
      ) : null;

    const jobBlock = isJobMarket ? (
      <div className={children.length > 0 ? "border-b border-sam-border" : ""}>
        <div className={APP_MAIN_HEADER_INNER_CLASS}>
          <JobListingKindTabs
            category={category}
            selectedKind={jobKindTab}
            topicKey={topicKeyForChips}
          />
        </div>
      </div>
    ) : null;

    if (!jobBlock && !topicBlock) return null;

    return (
      <div className={TRADE_SECONDARY_TABS_SHELL_CLASS}>
        <div className="flex w-full min-w-0 flex-col">
          {jobBlock}
          {topicBlock}
        </div>
      </div>
    );
  }, [children, marketBase, topicKeyForChips, isJobMarket, category.id, category.type, category.slug, jobKindTab]);

  const tradeSecondaryTabsSyncKey = useMemo(
    () =>
      `${category.id}\u0000${topicKeyForChips ?? ""}\u0000${jobKindTab}\u0000${children.map((c) => c.id).join(",")}\u0000${isJobMarket ? 1 : 0}`,
    [category.id, topicKeyForChips, jobKindTab, children, isJobMarket]
  );

  useRegisterTradeSecondaryTabs(
    isJobMarket || children.length > 0,
    secondaryHeaderNode,
    tradeSecondaryTabsSyncKey
  );

  const postsTopGapClass =
    isJobMarket || children.length > 0
      ? TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS
      : TRADE_GAP_MENU_TO_POSTS_CLASS;

  return (
    <div className="touch-pan-y" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className={`${TRADE_CONTENT_SHELL_CLASS} ${postsTopGapClass}`}>
        {filterRows === null ? (
          <div className="py-8 text-center sam-text-body text-sam-muted">불러오는 중…</div>
        ) : (
          <PostListByCategory
            categoryId={category.id}
            tradeFeedServerResolution
            tradeTopicParam={topicRaw}
            category={category}
            sort={postSort}
            jobsListingKind={isJobMarket ? jobKindTab : undefined}
            initialTradeFeed={initialTradeFeed}
          />
        )}
      </div>
    </div>
  );
}
