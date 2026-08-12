"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getHomeChipCategories } from "@/lib/categories/getHomeChipCategories";
import { isTradeMarketRouteActive } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";
import { hydrateTradeMarketCategoryPeekCache } from "@/lib/market/peek-trade-market-client-shell";
import type { TradePrimaryTab } from "./types";

let cachedTradePrimaryCategories: CategoryWithSettings[] | null = null;
let tradePrimaryCategoriesFlight: Promise<CategoryWithSettings[]> | null = null;
let tradePrimaryCategoriesPrimed = false;

function hydratePeekFromTradeChips(list: CategoryWithSettings[]): void {
  for (const c of list) {
    if (c.type === "trade") hydrateTradeMarketCategoryPeekCache(c);
  }
}

/** RSC `layout` — `getHomeTradeChipCategoriesForServer` 와 동기(같은 쿼리). `AppStickyHeader` 보다 먼저 프라임. */
export function primeTradeTabCategoriesCache(categories: CategoryWithSettings[]): void {
  tradePrimaryCategoriesPrimed = true;
  cachedTradePrimaryCategories = categories;
  hydratePeekFromTradeChips(categories);
}

async function loadTradePrimaryCategories(): Promise<CategoryWithSettings[]> {
  if (tradePrimaryCategoriesPrimed) {
    return cachedTradePrimaryCategories ?? [];
  }
  if (cachedTradePrimaryCategories) {
    return cachedTradePrimaryCategories;
  }
  if (tradePrimaryCategoriesFlight) {
    return tradePrimaryCategoriesFlight;
  }
  tradePrimaryCategoriesFlight = getHomeChipCategories()
    .then((list) => {
      tradePrimaryCategoriesPrimed = true;
      cachedTradePrimaryCategories = list;
      hydratePeekFromTradeChips(list);
      return list;
    })
    .finally(() => {
      tradePrimaryCategoriesFlight = null;
    });
  return tradePrimaryCategoriesFlight;
}

export function useTradeTabs(pathname: string) {
  const { language, safeT } = useI18n();
  const [tradeCategories, setTradeCategories] = useState<CategoryWithSettings[]>(
    cachedTradePrimaryCategories ?? []
  );
  const [loading, setLoading] = useState(!tradePrimaryCategoriesPrimed);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (tradePrimaryCategoriesPrimed) {
      setTradeCategories(cachedTradePrimaryCategories ?? []);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void loadTradePrimaryCategories()
      .then((list) => {
        if (cancelled) return;
        setTradeCategories(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError((e as Error)?.message ?? "TRADE 카테고리를 불러올 수 없습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = useMemo<TradePrimaryTab[]>(
    () => [
      {
        key: "all",
        label: safeT("trade_market_tab_all"),
        href: "/market",
        isActive: pathname === "/market",
      },
      ...tradeCategories.map((category) => ({
        key: category.id,
        label: resolveTradeCategoryUILabel(
          language,
          category.name,
          category.name_en,
          category.slug,
          category.icon_key
        ),
        href: getCategoryHref(category),
        isActive: isTradeMarketRouteActive(pathname, category),
      })),
    ],
    [pathname, tradeCategories, language, safeT]
  );

  const activeIndex = tabs.findIndex((tab) => tab.isActive);

  return {
    tradeCategories,
    loading,
    error,
    tabs,
    activeIndex,
  };
}
