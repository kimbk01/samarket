"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HomeProductList } from "@/components/home/HomeProductList";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { TRADE_GAP_MENU_TO_POSTS_CLASS } from "@/lib/trade/ui/post-spacing";

const HomeFeedViewExperimental = dynamic(
  () =>
    import("@/components/home-feed/HomeFeedViewExperimental").then((m) => ({
      default: m.HomeFeedViewExperimental,
    })),
  { ssr: false, loading: () => null }
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
  const pathname = usePathname();
  const router = useRouter();
  const { tabs, activeIndex } = useTradeTabs(pathname);

  useEffect(() => {
    const cancelWarm = warmMainShellData();
    return () => {
      cancelWarm();
    };
  }, []);
  const onNavigate = useCallback(
    (href: string) => {
      router.push(href, { scroll: false });
    },
    [router]
  );
  const { onTouchStart, onTouchEnd } = useSwipeTabNavigation(tabs, activeIndex, onNavigate);

  return (
    <div
      className={`touch-pan-y min-w-0 w-full max-w-full ${APP_MAIN_GUTTER_X_CLASS} ${TRADE_GAP_MENU_TO_POSTS_CLASS}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <HomeTradeFeedBody initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />
    </div>
  );
}
