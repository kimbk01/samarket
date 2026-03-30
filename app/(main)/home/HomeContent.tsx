"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HomeFeedView } from "@/components/home-feed/HomeFeedView";
import { warmMainShellData } from "@/lib/app/warm-main-shell-data";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";
import { TRADE_CONTENT_SHELL_CLASS } from "@/lib/trade/ui/content-shell";
import { TRADE_GAP_MENU_TO_POSTS_CLASS } from "@/lib/trade/ui/post-spacing";

export function HomeContent() {
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
      className="touch-pan-y min-w-0 w-full max-w-full"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className={`${TRADE_CONTENT_SHELL_CLASS} ${TRADE_GAP_MENU_TO_POSTS_CLASS} min-w-0 max-w-full`}
      >
        <HomeFeedView />
      </div>
    </div>
  );
}
