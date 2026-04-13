"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";
import { HomeFeedView } from "@/components/home-feed/HomeFeedView";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { TRADE_GAP_MENU_TO_POSTS_CLASS } from "@/lib/trade/ui/post-spacing";

export function HomeContent({
  initialHomeTradeFeed,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { tabs, activeIndex } = useTradeTabs(pathname);

  useEffect(() => {
    warmMainShellData();
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
      <HomeFeedView initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />
    </div>
  );
}
