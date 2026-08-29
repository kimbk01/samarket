"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { DeliverySearchResults } from "@/components/delivery/search/DeliverySearchResults";

type DeliverySearchStore = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
};

type DeliverySearchMenu = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
};

type SearchResponse = {
  ok: boolean;
  stores: DeliverySearchStore[];
  menus: DeliverySearchMenu[];
  result_count: number;
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

function normalizeKeyword(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function DeliverySearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<DeliverySearchStore[]>([]);
  const [menus, setMenus] = useState<DeliverySearchMenu[]>([]);
  const [resultCount, setResultCount] = useState(0);
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

  const runSearch = useCallback(
    async (keyword: string, reason: "debounce" | "submit" | "chip") => {
      const k = normalizeKeyword(keyword);
      if (k.length < 1) {
        setStores([]);
        setMenus([]);
        setResultCount(0);
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
        console.log("[delivery-search-response]", j);
        if (controller.signal.aborted) return;
        setStores(Array.isArray(j.stores) ? j.stores : []);
        setMenus(Array.isArray(j.menus) ? j.menus : []);
        setResultCount(Number.isFinite(Number(j.result_count)) ? Number(j.result_count) : 0);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStores([]);
        setMenus([]);
        setResultCount(0);
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
            onClickStore={onClickStore}
            onClickMenu={onClickMenu}
          />
        )}
      </main>
    </div>
  );
}

