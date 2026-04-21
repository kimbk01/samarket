"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProductsForHome } from "@/lib/mock-products";
import { useRegion } from "@/contexts/RegionContext";
import {
  filterByKeyword,
  filterByRegionName,
  filterByCategory,
  filterByStatus,
  sortSearchResults,
} from "@/lib/search/search-utils";
import { addRecentSearch } from "@/lib/search/mock-search-data";
import { getRegionName } from "@/lib/regions/region-utils";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { logEvent } from "@/lib/recommendation/mock-user-behavior-events";
import { getBlockedUserIds } from "@/lib/reports/mock-blocked-users";
import { SearchInputBar } from "./SearchInputBar";
import { RecentSearches } from "./RecentSearches";
import { SearchFilterBar, getDefaultSearchFilters, type SearchFilters } from "./SearchFilterBar";
import { SearchResultList } from "./SearchResultList";
import { POPULAR_SEARCHES } from "@/lib/search/mock-search-data";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

export function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const queryFromUrl = searchParams.get("q") ?? "";
  const { currentRegionName } = useRegion();
  const currentUserId = getCurrentUserId();
  const blockedIds = useMemo(() => getBlockedUserIds(currentUserId), [currentUserId]);

  const [keyword, setKeyword] = useState(queryFromUrl);
  const [filters, setFilters] = useState<SearchFilters>(getDefaultSearchFilters);

  useEffect(() => {
    setKeyword(queryFromUrl);
  }, [queryFromUrl]);

  const baseProducts = useMemo(() => {
    const list = getProductsForHome(currentRegionName ?? undefined);
    return list.filter((p) => {
      const sellerId = p.sellerId ?? p.seller?.id;
      return !sellerId || !blockedIds.includes(sellerId);
    });
  }, [currentRegionName, blockedIds]);

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
  const showPopular = !showResults;

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
                placeholder="검색어를 입력하세요"
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
        <>
          <RecentSearches onSelectKeyword={handleSelectRecent} />
          {showPopular && (
            <section className="px-4 py-3">
              <p className="sam-text-body-secondary font-medium text-sam-fg">
                인기 검색어
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((word) => (
                  <li key={word}>
                    <button
                      type="button"
                      onClick={() => handleSelectRecent(word)}
                      className="rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg"
                    >
                      {word}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
