"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { primeTradeTabCategoriesCache } from "@/lib/trade/tabs/use-trade-tabs";

/**
 * RSC가 내려준 홈 TRADE 칩 목록을 **렌더 동안** 모듈 캐시에 심는다. `AppStickyHeader` > `TradePrimaryTabs`
 * 가 `useTradeTabs` 를 읽을 때 이미 `cachedTradePrimaryCategories` 가 채워진 상태가 되게 한다.
 */
export function TradeTabCategoriesServerPrime({
  initialCategories,
}: {
  initialCategories: CategoryWithSettings[] | null;
}) {
  if (initialCategories && initialCategories.length > 0) {
    primeTradeTabCategoriesCache(initialCategories);
  }
  return null;
}
