"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product } from "@/lib/types/product";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import { postsToSearchProducts } from "@/lib/search/post-with-meta-to-product";
import { addRecentSearch } from "@/lib/search/recent-searches-local";
import { getViewerUserId } from "@/lib/auth/viewer-user-id";
import { logEvent } from "@/lib/recommendation/recommendation-behavior-state";
import {
  getBlockedUserIds,
  refreshBlockedUsersFromServer,
} from "@/lib/reports/user-blocks-client";
import { SearchInputBar } from "./SearchInputBar";
import { RecentSearches } from "./RecentSearches";
import { SearchFilterBar, getDefaultSearchFilters, type SearchFilters } from "./SearchFilterBar";
import { SearchResultList } from "./SearchResultList";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useTradeMarketplaceLocationHydrate } from "@/lib/trade/location/use-trade-marketplace-location-hydrate";
import { marketplaceLocationFetchGate } from "@/lib/trade/marketplace/client-location-fetch";
import {
  applyTradeLocationScopeToSearchParams,
  parseTradeLocationScopeFromSearchParams,
} from "@/lib/trade/location/trade-location-scope";
import { parseMarketplacePriceBound } from "@/lib/trade/marketplace/query-contract";
import { getCategories } from "@/lib/categories/getCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  resolveTradeCompositionForCategoryId,
  splitTradeListingAndCompositionOwnerIds,
  withSellIntentListDefaults,
} from "@/lib/trade/category-form";

export function SearchView() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const { scope, unresolved } = useTradeMarketplaceLocationHydrate();
  const locGate = useMemo(() => marketplaceLocationFetchGate(scope), [scope]);
  const queryFromUrl = searchParams.get("q") ?? "";
  const currentUserId = getViewerUserId();
  const [blockedIds, setBlockedIds] = useState<string[]>(() =>
    currentUserId ? getBlockedUserIds(currentUserId) : []
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId) {
      setBlockedIds([]);
      return;
    }
    void refreshBlockedUsersFromServer(currentUserId).then(setBlockedIds);
  }, [currentUserId]);

  const [keyword, setKeyword] = useState(queryFromUrl);
  const [filters, setFilters] = useState<SearchFilters>(getDefaultSearchFilters);
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    void getCategories({ type: "trade", activeOnly: true }).then(setCategories);
  }, []);

  const listingAndComposition = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return splitTradeListingAndCompositionOwnerIds(filters.categoryId, byId);
  }, [categories, filters.categoryId]);

  useEffect(() => {
    setKeyword(queryFromUrl);
  }, [queryFromUrl]);

  const applyBlocked = useCallback(
    (list: Product[]) =>
      list.filter((p) => {
        const sellerId = p.sellerId ?? p.seller?.id;
        return !sellerId || !blockedIds.includes(sellerId);
      }),
    [blockedIds]
  );

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const q = keyword.trim();
      if (!q || !locGate.canFetch) {
        if (!append) {
          setProducts([]);
          setHasMore(false);
        }
        return;
      }
      setLoading(true);
      try {
        const res = await getPostsForHome({
          page: pageNum,
          sort: locGate.lguCityId && filters.sortKey === "distance" ? "distance" : "latest",
          tradeState: filters.status === "all" ? "latest" : filters.status,
          /** listing narrowing only — child id stays child; composition owner is root via loader 1-hop */
          tradeMarketParentId: listingAndComposition.listingCategoryId,
          locationAll: locGate.locationAll === true,
          lguCityId: locGate.lguCityId ?? null,
          radiusKm: locGate.radiusKm ?? null,
          q,
          priceMin: parseMarketplacePriceBound(filters.priceMin),
          priceMax: parseMarketplacePriceBound(filters.priceMax),
          compositionFilters: listingAndComposition.compositionOwnerId
            ? withSellIntentListDefaults(
                filters.compositionFilters,
                resolveTradeCompositionForCategoryId(
                  listingAndComposition.compositionOwnerId,
                  new Map(categories.map((c) => [c.id, c]))
                )
              )
            : {},
        });
        const next = applyBlocked(postsToSearchProducts(res.posts ?? []));
        setProducts((prev) => (append ? [...prev, ...next] : next));
        setHasMore(res.hasMore === true);
        setPage(pageNum);
      } finally {
        setLoading(false);
      }
    },
    [keyword, locGate, filters, listingAndComposition, applyBlocked, categories]
  );

  useEffect(() => {
    if (!keyword.trim()) {
      setProducts([]);
      setHasMore(false);
      return;
    }
    void fetchPage(1, false);
  }, [keyword, fetchPage]);

  const handleSubmit = useCallback(
    (k: string) => {
      const q = k.trim();
      if (!q) return;
      addRecentSearch(q);
      logEvent({
        userId: currentUserId,
        eventType: "search_submit",
        query: q,
      });
      setKeyword(q);
      const next = applyTradeLocationScopeToSearchParams(
        new URLSearchParams(searchParams.toString()),
        parseTradeLocationScopeFromSearchParams(searchParams)
      );
      next.set("q", q);
      router.replace(`/search?${next.toString()}`, { scroll: false });
    },
    [router, currentUserId, searchParams]
  );

  const handleSelectRecent = useCallback(
    (k: string) => {
      setKeyword(k);
      handleSubmit(k);
    },
    [handleSubmit]
  );

  const showResults = keyword.trim().length > 0;
  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      stickyBelow: (
        <div className="border-b border-sam-border bg-[var(--sub-bg)]">
          <div className="flex h-12 items-center gap-2 px-4 py-1.5">
            <div className="min-w-0 flex-1">
              <SearchInputBar
                value={keyword}
                onChange={setKeyword}
                onSubmit={handleSubmit}
                placeholder={t("trade_028")}
                autoFocus
              />
            </div>
            {showResults ? (
              <span className="shrink-0 sam-text-body-secondary font-medium text-[var(--text-muted)]" aria-hidden>
                필터
              </span>
            ) : null}
          </div>
          {showResults ? (
            <SearchFilterBar
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(getDefaultSearchFilters())}
              distanceEnabled={Boolean(locGate.lguCityId)}
            />
          ) : null}
        </div>
      ),
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, keyword, showResults, filters, handleSubmit, locGate.lguCityId, t]);

  return (
    <div className="mx-auto max-w-lg pb-24">
      {showResults ? (
        <>
          <SearchResultList products={products} />
          {hasMore ? (
            <div className="px-4 pb-6">
              <button
                type="button"
                className="w-full min-h-11 rounded-ui-rect border border-sam-border text-sm font-semibold text-sam-fg"
                disabled={loading || unresolved || !locGate.canFetch}
                onClick={() => void fetchPage(page + 1, true)}
              >
                {safeT("trade_market_load_more", {
                  fallbackKo: "더 보기",
                  fallbackEn: "Load more",
                })}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <RecentSearches onSelectKeyword={handleSelectRecent} />
      )}
    </div>
  );
}
