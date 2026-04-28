"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HomeProductList } from "@/components/home/HomeProductList";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import { resolveTradeSwipeTarget } from "@/lib/trade/swipe/resolve-trade-swipe-target";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
import { getPostsByTradeCategoryIds, peekCachedTradeFeed } from "@/lib/posts/getPostsByCategory";
import { getPostsForHome, peekCachedPostsForHome } from "@/lib/posts/getPostsForHome";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

const HomeFeedViewExperimental = dynamic(
  () =>
    import("@/components/home-feed/HomeFeedViewExperimental").then((m) => ({
      default: m.HomeFeedViewExperimental,
    })),
  { ssr: true, loading: () => null }
);

function MarketTradeFeedBody({
  initialHomeTradeFeed,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  if (isProductionDeploy()) {
    return <HomeProductList initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />;
  }
  const experimental =
    process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_HOME_FEED === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_HOME_FEED === "true";
  if (!experimental) {
    return <HomeProductList initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />;
  }
  return <HomeFeedViewExperimental />;
}

export function MarketContent({
  initialHomeTradeFeed,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  recordTradeListMetricOnce("trade_list_home_content_render_start_ms");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tradeState = searchParams.get("tradeState") ?? "";
  const { tabs, activeIndex } = useTradeTabs(pathname);

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
    const h = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    if (h) void router.push(h, { scroll: false });
  }, [tabs, activeIndex, router]);

  const swipeToPrev = useCallback(() => {
    const h = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    if (h) void router.push(h, { scroll: false });
  }, [tabs, activeIndex, router]);

  const { setSwipeableEl: setMarketFeedSwipeable } = useMobileHorizontalSwipePanel({
    enabled: feedSwipeOn,
    swipeableRef: feedSwipeableRef,
    onCommitNext: swipeToNext,
    onCommitPrev: swipeToPrev,
    canGoNext: canSwipeNext,
    canGoPrev: canSwipePrev,
  });

  useLayoutEffect(() => {
    recordTradeListMetricOnce("trade_list_home_content_render_end_ms");
  }, []);

  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      const targets = new Set<string>();
      const next = resolveTradeSwipeTarget(tabs, activeIndex, "next");
      const prev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
      if (next) targets.add(next);
      if (prev) targets.add(prev);
      for (const href of targets) {
        void router.prefetch(href);
      }
    }, 300);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [tabs, activeIndex, router]);

  useEffect(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const next = resolveTradeSwipeTarget(tabs, activeIndex, "next");
    const prev = resolveTradeSwipeTarget(tabs, activeIndex, "prev");
    if (next) void router.prefetch(next);
    if (prev) void router.prefetch(prev);
    const prewarmTradeSurfaceHref = (href: string) => {
      const pathOnly = (href.split("?")[0] ?? "").trim();
      if (!pathOnly) return;
      if (pathOnly === "/market") {
        const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
        if (!hit?.posts?.length) {
          void getPostsForHome({ page: 1, sort: "latest", type: null, tradeState: "latest" });
        }
        return;
      }
      const m = pathOnly.match(/^\/market\/([^/]+)$/);
      if (!m) return;
      let parent = m[1]!;
      try {
        parent = decodeURIComponent(parent);
      } catch {
        /* noop */
      }
      const hit = peekCachedTradeFeed([], {
        page: 1,
        sort: "latest",
        tradeMarketParent: parent,
        topic: "",
      });
      if (!hit?.posts?.length) {
        void getPostsByTradeCategoryIds([], {
          page: 1,
          sort: "latest",
          tradeMarketParent: parent,
          topic: "",
        });
      }
    };
    if (next) prewarmTradeSurfaceHref(next);
    if (prev) prewarmTradeSurfaceHref(prev);
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
      <div ref={setMarketFeedSwipeable} className="will-change-transform touch-pan-y min-w-0 w-full max-w-full">
        <MarketTradeFeedBody
          key={`home-feed:${tradeState || "latest"}`}
          initialHomeTradeFeed={initialHomeTradeFeed ?? undefined}
        />
      </div>
    </div>
  );
}
