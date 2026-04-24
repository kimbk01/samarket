"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HomeProductList } from "@/components/home/HomeProductList";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { getBottomNavAdjacentHref } from "@/lib/main-menu/bottom-nav-config";
import { recordTradeListMetricOnce } from "@/lib/runtime/trade-list-entry-debug";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useMobileHorizontalSwipePanel } from "@/lib/ui/use-mobile-horizontal-swipe-panel";
const HomeFeedViewExperimental = dynamic(
  () =>
    import("@/components/home-feed/HomeFeedViewExperimental").then((m) => ({
      default: m.HomeFeedViewExperimental,
    })),
  { ssr: true, loading: () => null }
);

function HomeTradeFeedBody({ initialHomeTradeFeed }: { initialHomeTradeFeed?: GetPostsForHomeResult | null }) {
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

export function HomeContent({
  initialHomeTradeFeed,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  recordTradeListMetricOnce("trade_list_home_content_render_start_ms");
  const pathname = usePathname();
  const router = useRouter();
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
    if (tabs.length === 0 || activeIndex < 0) return false;
    if (activeIndex < tabs.length - 1) return true;
    return getBottomNavAdjacentHref("home", "next") != null;
  }, [tabs.length, activeIndex]);

  const canSwipePrev = useMemo(() => {
    if (tabs.length === 0 || activeIndex < 0) return false;
    if (activeIndex > 0) return true;
    return getBottomNavAdjacentHref("home", "prev") != null;
  }, [tabs.length, activeIndex]);

  const swipeToNext = useCallback(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (activeIndex < tabs.length - 1) {
      void router.push(tabs[activeIndex + 1]!.href, { scroll: false });
      return;
    }
    const h = getBottomNavAdjacentHref("home", "next");
    if (h) void router.push(h, { scroll: false });
  }, [tabs, activeIndex, router]);

  const swipeToPrev = useCallback(() => {
    if (tabs.length === 0 || activeIndex < 0) return;
    if (activeIndex > 0) {
      void router.push(tabs[activeIndex - 1]!.href, { scroll: false });
      return;
    }
    const h = getBottomNavAdjacentHref("home", "prev");
    if (h) void router.push(h, { scroll: false });
  }, [tabs, activeIndex, router]);

  const { setSwipeableEl: setHomeFeedSwipeable } = useMobileHorizontalSwipePanel({
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
    const cancelWarm = warmMainShellData();
    return () => {
      cancelWarm();
    };
  }, []);

  useEffect(() => {
    recordTradeListMetricOnce("trade_list_hydration_complete_ms");
  }, []);

  // `HomeProductList` `<ul>` — `PHILIFE_FEED_LIST_WRAP`만으로 탭~첫 카드 간격(커뮤니티 `CommunityFeed`와 동일, `TRADE_GAP_MENU_TO_POSTS` 없음)
  return (
    <div className="min-w-0 w-full max-w-full">
      <div ref={setHomeFeedSwipeable} className="will-change-transform touch-pan-y min-w-0 w-full max-w-full">
        <HomeTradeFeedBody initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />
      </div>
    </div>
  );
}
