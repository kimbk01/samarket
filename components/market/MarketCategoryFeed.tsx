"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories } from "@/lib/categories/getChildCategories";
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

function parseJobListingKindParam(raw: string | null): JobListingKindTab {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "work" ? "work" : "hire";
}

export function MarketCategoryFeed({ category }: { category: CategoryWithSettings }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicRaw = (searchParams.get("topic")?.trim() ?? "").normalize("NFC");
  const jobKindTab = parseJobListingKindParam(searchParams.get("jk"));
  const [children, setChildren] = useState<CategoryWithSettings[]>([]);
  const { tabs, activeIndex } = useTradeTabs(pathname);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getChildCategories(category.id);
      if (!cancelled) setChildren(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [category.id]);

  const topicChild = useMemo(() => {
    if (!topicRaw) return null;
    return (
      children.find((c) => {
        const slug = c.slug?.trim().normalize("NFC");
        return (slug && slug === topicRaw) || c.id === topicRaw;
      }) ?? null
    );
  }, [children, topicRaw]);

  /** 칩 하이라이트: 잘못된 topic 쿼리는 미선택(전체 피드)과 동일 */
  const topicKeyForChips = topicChild ? topicRaw : null;

  const filterIds = useMemo(() => {
    if (children.length === 0) return [category.id];
    if (topicChild) return [topicChild.id];
    return [category.id, ...children.map((c) => c.id)];
  }, [category.id, children, topicChild]);

  const marketBase = `/market/${encodedTradeMarketSegment(category)}`;
  const isJobMarket =
    category.icon_key === "job" || category.icon_key === "jobs" || category.slug === "job";
  const postSort = sortKeyToHomePostSort("latest");
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
        <PostListByCategory
          categoryId={category.id}
          filterCategoryIds={filterIds}
          category={category}
          sort={postSort}
          jobsListingKind={isJobMarket ? jobKindTab : undefined}
        />
      </div>
    </div>
  );
}
