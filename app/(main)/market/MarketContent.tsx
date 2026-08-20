"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomeProductList } from "@/components/home/HomeProductList";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import { resolveTradeSwipeTarget } from "@/lib/trade/swipe/resolve-trade-swipe-target";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { commitTradeSwipeTabRoute } from "@/lib/trade/tabs/commit-trade-swipe-tab-route";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { MarketCategoryPageClient } from "@/components/market/MarketCategoryPageClient";
import { parseTradeMarketCategoryFromSearch } from "@/lib/trade/tabs/trade-market-feed-href";
import { prewarmBottomNavMarketTab } from "@/lib/main-menu/bottom-nav-tap-prewarm-trade";
import {
  parseMarketplaceBrowseStateFromSearchParams,
  resolveMarketCategorySurfaceQuery,
} from "@/lib/trade/marketplace/marketplace-browse-state";

function MarketTradeFeedBody({
  initialHomeTradeFeed,
  clientFeedInstantBoot = false,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { beginMenuNavigation, pendingMenuIntent, isPendingMenuBlockingContent } =
    useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();

  const categoryQueryFromUrl = parseTradeMarketCategoryFromSearch(searchParams);

  const categoryQueryFromIntent = useMemo(() => {
    if (!pendingMenuIntent?.search) return null;
    return resolveMarketCategorySurfaceQuery(new URLSearchParams(pendingMenuIntent.search));
  }, [pendingMenuIntent]);

  /** CUT-SSOT-6: URL authority; pending ROOT intent hides HOME rows during tab commit lag. */
  const categorySurfaceQuery = useMemo(() => {
    if (categoryQueryFromUrl) return categoryQueryFromUrl;
    if (isPendingMenuBlockingContent && categoryQueryFromIntent) {
      return categoryQueryFromIntent;
    }
    return null;
  }, [categoryQueryFromUrl, categoryQueryFromIntent, isPendingMenuBlockingContent]);

  const { tabs, activeIndex } = useTradeTabs(pathname, categoryQueryFromUrl, searchParams.toString());

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

    const idleId = scheduleWhenBrowserIdle(() => {
      for (const href of targets) {
        void router.prefetch(href);
        prewarmBottomNavMarketTab(href);
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

  const browseStateForSurface = useMemo(
    () => parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  return (
    <div className="min-w-0 w-full max-w-full">
      {categorySurfaceQuery ? (
        <MarketCategoryPageClient
          key={categorySurfaceQuery}
          tradeServerSeed={null}
          slugOrId={categorySurfaceQuery}
        />
      ) : (
        <div ref={setMarketFeedSwipeable} className="will-change-transform touch-pan-y min-w-0 w-full max-w-full">
          <MarketTradeFeedBody
            key={`home-feed:${browseStateForSurface.tradeState || "latest"}`}
            initialHomeTradeFeed={initialHomeTradeFeed ?? undefined}
            clientFeedInstantBoot={clientFeedInstantBoot}
          />
        </div>
      )}
    </div>
  );
}
