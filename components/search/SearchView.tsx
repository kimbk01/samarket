"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { AppBackButton } from "@/components/navigation/AppBackButton";

export function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  return (
    <div className="mx-auto max-w-lg pb-24">
      {/* 당근형: 좌측 뒤로가기, 중앙 검색창, 우측 필터 */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="flex h-14 items-center gap-2 px-4 py-2">
          <AppBackButton preferHistoryBack backHref="/home" />
          <div className="min-w-0 flex-1">
            <SearchInputBar
              value={keyword}
              onChange={setKeyword}
              onSubmit={handleSubmit}
              placeholder="검색어를 입력하세요"
              autoFocus
            />
          </div>
          {showResults && (
            <span className="shrink-0 text-[13px] font-medium text-gray-600" aria-hidden>
              필터
            </span>
          )}
        </div>
        {showResults && (
          <SearchFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(getDefaultSearchFilters())}
          />
        )}
      </div>

      {showResults ? (
        <SearchResultList products={filteredAndSorted} />
      ) : (
        <>
          <RecentSearches onSelectKeyword={handleSelectRecent} />
          {showPopular && (
            <section className="px-4 py-3">
              <p className="text-[13px] font-medium text-gray-700">
                인기 검색어
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((word) => (
                  <li key={word}>
                    <button
                      type="button"
                      onClick={() => handleSelectRecent(word)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-800"
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
