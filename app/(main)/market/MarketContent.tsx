"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomeProductList } from "@/components/home/HomeProductList";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { useTradeMarketplaceLocationHydrate } from "@/lib/trade/location/use-trade-marketplace-location-hydrate";
import { marketplaceHomePrewarmOptions } from "@/lib/trade/marketplace/client-location-fetch";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import { resolveTradeSwipeTarget } from "@/lib/trade/swipe/resolve-trade-swipe-target";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { commitTradeSwipeTabRoute } from "@/lib/trade/tabs/commit-trade-swipe-tab-route";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import {
  getPostsByTradeCategoryIds,
  readFreshTradeFeedClientCache,
  type GetPostsByCategoryOptions,
} from "@/lib/posts/getPostsByCategory";
import { parseTradeFeedSortQuery } from "@/lib/posts/parse-trade-feed-sort-query";
import { getPostsForHome, peekCachedPostsForHome } from "@/lib/posts/getPostsForHome";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { MarketCategoryPageClient } from "@/components/market/MarketCategoryPageClient";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { peekTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import { marketplaceFeedLocationExtras } from "@/lib/trade/marketplace/client-location-fetch";

/**
 * `/market` | `/market?category=…` 인접 탭 프리웜 — 목록은 일자리 URL 필터 없음(`jk` 등 무시), 주제·정렬만 반영.
 */
function peekOrWarmMarketCategoryFeedFromHref(href: string): void {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return;
  }
  const pathOnly = url.pathname.trim().replace(/\/+$/, "") || "";
  let parent = "";
  if (pathOnly === "/market") {
    parent = (url.searchParams.get("category") ?? "").trim();
  } else {
    const m = pathOnly.match(/^\/market\/([^/]+)$/);
    if (!m) return;
    parent = m[1]!;
  }
  if (!parent) return;
  try {
    parent = decodeURIComponent(parent);
  } catch {
    /* noop */
  }

  const topicRaw = (url.searchParams.get("topic") ?? "").trim().normalize("NFC");
  const sort = parseTradeFeedSortQuery(url.searchParams.get("sort") ?? url.searchParams.get("fs"));
  const tradeStateRaw = (url.searchParams.get("tradeState") ?? "").trim();
  const tradeState = parseMarketplacePublicTradeState(tradeStateRaw);

  let locExtras = marketplaceFeedLocationExtras(
    parseTradeLocationScopeFromSearchParams(url.searchParams)
  );
  if (!locExtras.lguCityId && !locExtras.locationAll) {
    const session = peekTradeBrowseCommittedScope();
    if (!session) return;
    locExtras = marketplaceFeedLocationExtras(session);
    if (!locExtras.lguCityId && !locExtras.locationAll) return;
  }

  const useUnfilteredMarketParentFeed = !topicRaw;

  const base = {
    page: 1,
    sort,
    tradeMarketParent: parent,
    tradeState,
    ...locExtras,
  };

  const options: GetPostsByCategoryOptions = useUnfilteredMarketParentFeed
    ? { ...base, topic: "" }
    : { ...base, topic: topicRaw };

  if (readFreshTradeFeedClientCache([], options)) return;
  void getPostsByTradeCategoryIds([], options);
}

function MarketTradeFeedBody({
  initialHomeTradeFeed,
  clientFeedInstantBoot = false,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
  /** 탭 push·Suspense 대기 — 첫 페인트 전 홈 피드 캐시 */
  clientFeedInstantBoot?: boolean;
}) {
  return (
    <HomeProductList
      initialHomeTradeFeed={initialHomeTradeFeed ?? undefined}
      clientInstantBoot={clientFeedInstantBoot}
    />
  );
}

export function MarketContent({
  initialHomeTradeFeed,
  clientFeedInstantBoot = false,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
  clientFeedInstantBoot?: boolean;
}) {
  useTradeMarketplaceLocationHydrate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { beginMenuNavigation } = useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const tradeState = searchParams.get("tradeState") ?? "";
  const categoryQuery = parseTradeMarketCategoryFromSearch(searchParams);
  const { tabs, activeIndex } = useTradeTabs(pathname, categoryQuery);

  const feedSwipeableRef = useRef<HTMLDivElement | null>(null);
  const [feedSwipeOn, setFeedSwipeOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const go = () => {
      setFeedSwipeOn(mq.matches);
    };
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);

  const canSwipeNext = useMemo(() => {
    return resolveTradeSwipeTarget(tabs, activeIndex, "next") != null;
  }, [tabs, activeIndex]);

  const canSwipePrev = useMemo(() => {
    return resolveTradeSwipeTarget(tabs, activeIndex, "prev") != null;
  }, [tabs, activeIndex]);

  const swipeToNext = useCallback(() => {
    commitTradeSwipeTabRoute({
      tabs,
      activeIndex,
      direction: "next",
      beginMenuNavigation,
      guardBeforeNavigate,
      router,
    });
  }, [tabs, activeIndex, router, beginMenuNavigation, guardBeforeNavigate]);

  const swipeToPrev = useCallback(() => {
    commitTradeSwipeTabRoute({
      tabs,
      activeIndex,
      direction: "prev",
      beginMenuNavigation,
      guardBeforeNavigate,
      router,
    });
  }, [tabs, activeIndex, router, beginMenuNavigation, guardBeforeNavigate]);

  const { setSwipeableEl: setMarketFeedSwipeable } = useMobileHorizontalSwipePanel({
    enabled: feedSwipeOn,
    swipeableRef: feedSwipeableRef,
    onCommitNext: swipeToNext,
    onCommitPrev: swipeToPrev,
    canGoNext: canSwipeNext,
    canGoPrev: canSwipePrev,
  });

  useLayoutEffect(() => {
    recordTradeListMetricOnce("trade_list_home_content_render_start_ms");
    recordTradeListMetricOnce("trade_list_home_content_render_end_ms");
  }, []);

  /** 인접 탭: 단일 idle 작업으로 prefetch + 피드 프리웜(이전에는 동일 URL에 prefetch가 즉시·지연 이중 호출됨) */
  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const next = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    const prev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    const targets = new Set<string>();
    if (next) targets.add(next);
    if (prev) targets.add(prev);
    if (targets.size === 0) return;

    const prewarmTradeSurfaceHref = (href: string) => {
      const pathOnly = (href.split("?")[0] ?? "").trim().replace(/\/+$/, "") || "";
      if (pathOnly === "/market") {
        let cat = "";
        try {
          cat = new URL(href, "http://localhost").searchParams.get("category")?.trim() ?? "";
        } catch {
          cat = "";
        }
        if (cat) {
          peekOrWarmMarketCategoryFeedFromHref(href);
          return;
        }
        const hit = peekCachedPostsForHome(
          marketplaceHomePrewarmOptions() ?? { sort: "latest", type: null, tradeState: "latest" }
        );
        const prewarm = marketplaceHomePrewarmOptions();
        if (prewarm && !hit?.posts?.length) {
          void getPostsForHome({ page: 1, ...prewarm });
        }
        return;
      }
      const m = pathOnly.match(/^\/market\/([^/]+)$/);
      if (!m) return;
      peekOrWarmMarketCategoryFeedFromHref(href);
    };

    const idleId = scheduleWhenBrowserIdle(() => {
      for (const href of targets) {
        void router.prefetch(href);
        prewarmTradeSurfaceHref(href);
      }
    }, 300);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [tabs, activeIndex, router]);

  useEffect(() => {
    const cancelWarm = warmMainShellData();
    return () => {
      cancelWarm();
    };
  }, []);

  useEffect(() => {
    recordTradeListMetricOnce("trade_list_hydration_complete_ms");
  }, []);

  return (
    <div className="min-w-0 w-full max-w-full">
      {categoryQuery ? (
        <MarketCategoryPageClient
          key={categoryQuery}
          tradeServerSeed={null}
          slugOrId={categoryQuery}
        />
      ) : (
        <div ref={setMarketFeedSwipeable} className="will-change-transform touch-pan-y min-w-0 w-full max-w-full">
          <MarketTradeFeedBody
            key={`home-feed:${tradeState || "latest"}`}
            initialHomeTradeFeed={initialHomeTradeFeed ?? undefined}
            clientFeedInstantBoot={clientFeedInstantBoot}
          />
        </div>
      )}
    </div>
  );
}
