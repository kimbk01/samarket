"use client";

import { useEffect, useMemo, useState } from "react";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { getHomeChipCategories } from "@/lib/categories/getHomeChipCategories";
import { isTradeMarketRouteActive } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { TradePrimaryTab } from "./types";

let cachedTradePrimaryCategories: CategoryWithSettings[] | null = null;
let tradePrimaryCategoriesFlight: Promise<CategoryWithSettings[]> | null = null;

async function loadTradePrimaryCategories(): Promise<CategoryWithSettings[]> {
  if (cachedTradePrimaryCategories) {
    return cachedTradePrimaryCategories;
  }
  if (tradePrimaryCategoriesFlight) {
    return tradePrimaryCategoriesFlight;
  }
  tradePrimaryCategoriesFlight = getHomeChipCategories()
    .then((list) => {
      cachedTradePrimaryCategories = list;
      return list;
    })
    .finally(() => {
      tradePrimaryCategoriesFlight = null;
    });
  return tradePrimaryCategoriesFlight;
}

export function useTradeTabs(pathname: string) {
  const [tradeCategories, setTradeCategories] = useState<CategoryWithSettings[]>(
    cachedTradePrimaryCategories ?? []
  );
  const [loading, setLoading] = useState(cachedTradePrimaryCategories == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cachedTradePrimaryCategories) {
      setTradeCategories(cachedTradePrimaryCategories);
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
        label: "전체",
        href: "/home",
        isActive: pathname === "/home",
      },
      ...tradeCategories.map((category) => ({
        key: category.id,
        label: category.name,
        href: getCategoryHref(category),
        isActive: isTradeMarketRouteActive(pathname, category),
      })),
    ],
    [pathname, tradeCategories]
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
