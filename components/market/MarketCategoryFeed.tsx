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
import {
  TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS,
  TRADE_GAP_MENU_TO_POSTS_CLASS,
} from "@/lib/trade/ui/post-spacing";
import {
  TRADE_SECONDARY_TABS_INNER_Y_CLASS,
  TRADE_SECONDARY_TABS_SHELL_CLASS,
} from "@/lib/trade/ui/secondary-tabs-surface";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { TRADE_CONTENT_SHELL_CLASS } from "@/lib/trade/ui/content-shell";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { useRegisterTradeSecondaryTabs } from "@/contexts/CategoryListHeaderContext";
import { TRADE_MARKET_TOPIC_SCROLL_NAV_CLASS } from "@/lib/trade/ui/market-topic-scroll";
import { JobListingKindTabs, type JobListingKindTab } from "@/components/market/JobListingKindTabs";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { computeTradeFeedKey } from "@/lib/posts/trade-feed-key";
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
  bootstrapFeed?: { posts: PostWithMeta[]; hasMore: boolean; feedKey: string } | null;
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

  useEffect(() => {
    if (initialChildrenForFilter !== undefined) return;
    let cancelled = false;
    void getChildCategoriesForFeedFilter(category.id).then((list) => {
      if (cancelled) return;
      setFilterRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, [category.id, initialChildrenForFilter]);

  useEffect(() => {
    if (initialChildren !== undefined) return;
    let cancelled = false;
    (async () => {
      const list = await getChildCategories(category.id);
      if (!cancelled) setChildren(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [category.id, initialChildren]);

  /** 칩 하이라이트: topic 은 피드 풀(activeChildren) 기준으로 유효할 때만 */
  const topicKeyForChips = useMemo(() => {
    if (!topicRaw || filterRows === null) return null;
    const match = filterRows.find((c) => {
      const slug = c.slug?.trim().normalize("NFC");
      return (slug && slug === topicRaw) || c.id === topicRaw;
    });
    return match ? topicRaw : null;
  }, [filterRows, topicRaw]);

  const filterIds = useMemo(() => {
    if (filterRows === null) return null;
    return computeMarketFilterIds({
      parentCategoryId: category.id,
      activeChildren: filterRows,
      topicParam: topicRaw,
    });
  }, [category.id, filterRows, topicRaw]);

  const marketBase = `/market/${encodedTradeMarketSegment(category)}`;
  const isJobMarket =
    category.icon_key === "job" || category.icon_key === "jobs" || category.slug === "job";
  const postSort = sortKeyToHomePostSort("latest");
  const feedKey = useMemo(() => {
    if (!filterIds) return "";
    return computeTradeFeedKey(filterIds, postSort, isJobMarket ? jobKindTab : undefined);
  }, [filterIds, postSort, isJobMarket, jobKindTab]);
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
        <div className={`w-full min-w-0 overflow-x-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
          <div className={TRADE_SECONDARY_TABS_INNER_Y_CLASS}>
            <HorizontalDragScroll
              className={TRADE_MARKET_TOPIC_SCROLL_NAV_CLASS}
              style={{ WebkitOverflowScrolling: "touch" }}
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
        </div>
      ) : null;

    const jobBlock = isJobMarket ? (
      <div className={`w-full min-w-0 overflow-x-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
        <div className={TRADE_SECONDARY_TABS_INNER_Y_CLASS}>
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
        <div className="flex w-full flex-col gap-2">
          {jobBlock}
          {topicBlock}
        </div>
      </div>
    );
  }, [children, marketBase, topicKeyForChips, isJobMarket, category, jobKindTab]);

  useRegisterTradeSecondaryTabs(isJobMarket || children.length > 0, secondaryHeaderNode);

  return (
    <div className="touch-pan-y" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        className={`${TRADE_CONTENT_SHELL_CLASS} ${
          isJobMarket || children.length > 0
            ? TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS
            : TRADE_GAP_MENU_TO_POSTS_CLASS
        }`}
      >
        {filterIds === null ? (
          <div className="py-8 text-center text-[14px] text-sam-muted">불러오는 중…</div>
        ) : (
          <PostListByCategory
            categoryId={category.id}
            filterCategoryIds={filterIds}
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
