"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product } from "@/lib/types/product";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import { postsToSearchProducts } from "@/lib/search/post-with-meta-to-product";
import { useRegion } from "@/contexts/RegionContext";
import {
  filterByKeyword,
  filterByRegionName,
  filterByCategory,
  filterByStatus,
  sortSearchResults,
} from "@/lib/search/search-utils";
import { addRecentSearch } from "@/lib/search/recent-searches-local";
import { getRegionName } from "@/lib/regions/region-utils";
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

export function SearchView() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const queryFromUrl = searchParams.get("q") ?? "";
  const { currentRegionName } = useRegion();
  const currentUserId = getViewerUserId();
  const [blockedIds, setBlockedIds] = useState<string[]>(() =>
    currentUserId ? getBlockedUserIds(currentUserId) : []
  );
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!currentUserId) {
      setBlockedIds([]);
      return;
    }
    void refreshBlockedUsersFromServer(currentUserId).then(setBlockedIds);
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    void getPostsForHome({ page: 1, sort: "latest", type: "trade" }).then((result) => {
      if (cancelled) return;
      const products = postsToSearchProducts(result.posts ?? []);
      setBaseProducts(
        products.filter((p) => {
          const sellerId = p.sellerId ?? p.seller?.id;
          return !sellerId || !blockedIds.includes(sellerId);
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currentRegionName, blockedIds]);

  const [keyword, setKeyword] = useState(queryFromUrl);
  const [filters, setFilters] = useState<SearchFilters>(getDefaultSearchFilters);

  useEffect(() => {
    setKeyword(queryFromUrl);
  }, [queryFromUrl]);

  const filteredAndSorted = useMemo(() => {
    let list = baseProducts;
    if (keyword.trim()) {
      list = filterByKeyword(list, keyword);
    }
    if (filters.regionId) {
      list = filterByRegionName(list, getRegionName(filters.regionId));
    }
    if (filters.category) list = filterByCategory(list, filters.category);
    if (filters.status) list = filterByStatus(list, filters.status);
    return sortSearchResults(list, filters.sortKey);
  }, [baseProducts, keyword, filters]);

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
      router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false });
    },
    [router, currentUserId]
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
            />
          ) : null}
        </div>
      ),
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, keyword, showResults, filters, handleSubmit, setFilters]);

  return (
    <div className="mx-auto max-w-lg pb-24">
      {showResults ? (
        <SearchResultList products={filteredAndSorted} />
      ) : (
        <RecentSearches onSelectKeyword={handleSelectRecent} />
      )}
    </div>
  );
}
