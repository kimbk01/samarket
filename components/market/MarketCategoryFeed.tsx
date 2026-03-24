"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories } from "@/lib/categories/getChildCategories";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { HomeCategoryChips } from "@/components/home/HomeCategoryChips";
import { TradeTopicChipsRow } from "@/components/home/TradeTopicChipsRow";
import { PostListByCategory } from "@/components/post/PostListByCategory";
import { sortKeyToHomePostSort } from "@/lib/constants/sort";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import { APP_MAIN_GUTTER_NEG_X_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/** 2단 주제: 항상 행 시작(좌) 정렬, 단일 칩도 가운데로 떠 보이지 않게 */
const TOPIC_SCROLL_NAV =
  "-mx-1 flex w-full min-w-0 flex-nowrap justify-start gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export function MarketCategoryFeed({ category }: { category: CategoryWithSettings }) {
  const searchParams = useSearchParams();
  const topicRaw = (searchParams.get("topic")?.trim() ?? "").normalize("NFC");
  const [children, setChildren] = useState<CategoryWithSettings[]>([]);

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
  const postSort = sortKeyToHomePostSort("latest");

  return (
    <>
      {/* 부모(APP_MAIN_GUTTER_X) 상쇄 → 메뉴 줄이 메인 컬럼 전폭 */}
      <div
        className={`sticky top-14 z-10 ${APP_MAIN_GUTTER_NEG_X_CLASS} border-b border-gray-200/80 bg-white/95 backdrop-blur md:rounded-t-xl md:shadow-sm`}
      >
        <div className={`w-full ${APP_MAIN_GUTTER_X_CLASS}`}>
          <div className="border-b border-gray-100 py-2">
            <HomeCategoryChips embed appearance="community" />
          </div>
          {children.length > 0 ? (
            <div className="border-t border-gray-50 py-2">
              <HorizontalDragScroll
                className={`${TOPIC_SCROLL_NAV} py-0.5`}
                style={{ WebkitOverflowScrolling: "touch" }}
                aria-label="주제 필터"
              >
                <TradeTopicChipsRow
                  marketBasePath={marketBase}
                  topics={children}
                  selectedTopicKey={topicKeyForChips}
                />
              </HorizontalDragScroll>
            </div>
          ) : null}
        </div>
      </div>
      <div className={`${APP_MAIN_GUTTER_NEG_X_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pt-3`}>
        <PostListByCategory
          categoryId={category.id}
          filterCategoryIds={filterIds}
          category={category}
          sort={postSort}
        />
      </div>
    </>
  );
}
