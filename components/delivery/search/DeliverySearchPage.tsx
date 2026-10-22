"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  buildDeliveryListScrollRouteKey,
  saveDeliveryListScrollBeforeStoreNavigation,
} from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import {
  navigateToDeliveryStoreCard,
  navigateToDeliveryStoreProduct,
} from "@/lib/navigation/navigate-to-delivery-store-product";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { DeliverySearchHeader } from "@/components/delivery/search/DeliverySearchHeader";
import { RecentSearchChips } from "@/components/delivery/search/RecentSearchChips";
import { PopularSearchList } from "@/components/delivery/search/PopularSearchList";
import { RecommendedSearchChips } from "@/components/delivery/search/RecommendedSearchChips";
import {
  DeliverySearchResults,
  type DeliverySearchMenu,
  type DeliverySearchStore,
} from "@/components/delivery/search/DeliverySearchResults";
import type { SearchTopBannerSlide } from "@/lib/stores/load-store-search-top-banners";
import {
  buildDeliverySearchHrefWithKeyword,
  normalizeDeliverySearchKeyword,
  readDeliverySearchKeywordFromParams,
} from "@/lib/delivery/search/delivery-search-url-keyword";

type SearchResponse = {
  ok: boolean;
  stores: DeliverySearchStore[];
  menus: DeliverySearchMenu[];
  result_count: number;
  searchTopBanner?: SearchTopBannerSlide | null;
};

const FALLBACK_RECOMMENDED = [
  "치킨",
  "피자",
  "한식",
  "분식",
  "카페",
  "도시락",
  "마트",
  "족발",
  "야식",
  "무료배달",
] as const;

const normalizeKeyword = normalizeDeliverySearchKeyword;

export function DeliverySearchPage() {
  const router = useRouter();
  /**
   * DSC-08 — 검색어 = URL `?q=` (매장·메뉴 진입 origin 도 `/stores/search?q=…`).
   * 뒤로 오면 `?q=` 로 검색어·결과·스크롤 복원 키를 그대로 되살린다.
   */
  const searchParams = useSearchParams();
  const urlQ = readDeliverySearchKeywordFromParams(searchParams);
  const [q, setQ] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<DeliverySearchStore[]>([]);
  const [menus, setMenus] = useState<DeliverySearchMenu[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [searchTopBanner, setSearchTopBanner] = useState<SearchTopBannerSlide | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const trimmed = useMemo(() => normalizeKeyword(q), [q]);
  const showResults = debouncedQ.trim().length >= 1;
  const listScrollRouteKey = useMemo(() => {
    const keyword = debouncedQ.trim();
    return buildDeliveryListScrollRouteKey(
      "/stores/search",
      keyword ? `?q=${encodeURIComponent(keyword)}` : ""
    );
  }, [debouncedQ]);
  useDeliveryListScrollRestore(listScrollRouteKey, showResults && !loading);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(trimmed), 250);
    return () => clearTimeout(t);
  }, [trimmed]);

  /** URL 이 바깥(뒤로가기 등)에서 바뀌면 따라간다 */
  const urlQRef = useRef(urlQ);
  useEffect(() => {
    if (urlQRef.current === urlQ) return;
    urlQRef.current = urlQ;
    setQ(urlQ);
    setDebouncedQ(urlQ);
  }, [urlQ]);

  /**
   * 확정된 검색어를 `?q=` 에 기록 — 네이티브 `history.replaceState` (기록 미적재·서버 컴포넌트 재요청 없음,
   * `useMypageTabParam` 과 같은 방식. Next app-router 가 `useSearchParams` 를 동기화한다).
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = buildDeliverySearchHrefWithKeyword(window.location.href, debouncedQ);
    if (!href) return;
    urlQRef.current = normalizeKeyword(debouncedQ);
    window.history.replaceState(null, "", href);
  }, [debouncedQ]);

  const runSearch = useCallback(
    async (keyword: string, reason: "debounce" | "submit" | "chip") => {
      const k = normalizeKeyword(keyword);
      if (k.length < 1) {
        setStores([]);
        setMenus([]);
        setResultCount(0);
        setSearchTopBanner(null);
        return;
      }

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(`/api/stores/search?q=${encodeURIComponent(k)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const j = (await res.json().catch(() => ({}))) as SearchResponse;
        if (controller.signal.aborted) return;
        setStores(Array.isArray(j.stores) ? j.stores : []);
        setMenus(Array.isArray(j.menus) ? j.menus : []);
        setResultCount(Number.isFinite(Number(j.result_count)) ? Number(j.result_count) : 0);
        setSearchTopBanner(j.searchTopBanner ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStores([]);
        setMenus([]);
        setResultCount(0);
        setSearchTopBanner(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debouncedQ.trim().length < 1) return;
    void runSearch(debouncedQ, "debounce");
  }, [debouncedQ, runSearch]);

  /** CUT 11 — same addresses-updated refresh as StoresHomeSearchModal hook (no new event system). */
  useEffect(() => {
    const onAddressesUpdated = () => {
      if (debouncedQ.trim().length < 1) return;
      void runSearch(debouncedQ, "debounce");
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [debouncedQ, runSearch]);

  const onSubmit = useCallback(
    (keyword: string) => {
      const k = normalizeKeyword(keyword);
      setQ(k);
      void runSearch(k, "submit");
    },
    [runSearch]
  );

  const onPickKeyword = useCallback(
    (keyword: string) => {
      const k = normalizeKeyword(keyword);
      setQ(k);
      void runSearch(k, "chip");
    },
    [runSearch]
  );

  const onClickStore = useCallback(
    (slug: string) => {
      const s = slug.trim();
      if (!s) return;
      const search = debouncedQ.trim() ? `?q=${encodeURIComponent(debouncedQ.trim())}` : "";
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(s);
      navigateToDeliveryStoreCard(router, {
        storeSlug: s,
        pathname: "/stores/search",
        search,
        originHrefOverride: listScrollRouteKey,
        originSurfaceOverride: "SEARCH",
        saveScroll: false,
      });
    },
    [router, listScrollRouteKey, debouncedQ]
  );

  const onClickMenu = useCallback(
    (menu: DeliverySearchMenu) => {
      const slug = menu.store_slug?.trim();
      if (!slug) return;
      const search = debouncedQ.trim() ? `?q=${encodeURIComponent(debouncedQ.trim())}` : "";
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(slug);
      navigateToDeliveryStoreProduct(router, {
        storeSlug: slug,
        productId: menu.id,
        childMode: "focusProduct",
        pathname: "/stores/search",
        search,
        originHrefOverride: listScrollRouteKey,
        originSurfaceOverride: "SEARCH",
        saveScroll: false,
      });
    },
    [router, listScrollRouteKey, debouncedQ]
  );

  return (
    <div className="min-h-0 bg-sam-app">
      <DeliverySearchHeader value={q} onChange={setQ} onSubmit={onSubmit} />
      <main className={`mx-auto max-w-lg px-4 pt-3 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
        {!showResults ? (
          <div className="space-y-5">
            <RecentSearchChips onPick={onPickKeyword} />
            <PopularSearchList keywords={[...FALLBACK_RECOMMENDED]} onPick={onPickKeyword} />
            <RecommendedSearchChips keywords={[...FALLBACK_RECOMMENDED]} onPick={onPickKeyword} />
          </div>
        ) : (
          <DeliverySearchResults
            q={debouncedQ}
            loading={loading}
            stores={stores}
            menus={menus}
            resultCount={resultCount}
            searchTopBanner={searchTopBanner}
            onClickStore={onClickStore}
            onClickMenu={onClickMenu}
          />
        )}
      </main>
    </div>
  );
}

