"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import {
  runTradeMarketPullRefresh,
  tradeMarketPtrStore,
} from "@/lib/trade/trade-market-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * CONTRACT — `/market`·`/market/[slug]` PTR: scrollTop=0 이면 세로 당김 → 1단·2단(탭) 사이 힌트 슬롯 확장.
 * 핸들러는 경로+committed query 라우트 키로 선택. 제스처 SSOT: `lib/ui/ptr/use-dibay-ptr-gesture.ts`.
 */
export function useTradeMarketPullRefresh(enabled: boolean): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const routeRef = useRef({ pathname, searchParams });
  useLayoutEffect(() => {
    routeRef.current = { pathname, searchParams };
  }, [pathname, searchParams]);

  useDibayPtrGesture({
    enabled,
    store: tradeMarketPtrStore,
    rootDatasetKey: "tradeMarketPtrRoot",
    resetRefreshingOnCleanup: true,
    rebindKey: `${pathname ?? ""}?${searchKey}`,
    onRelease: (pulled) => {
      const { pathname: p, searchParams: q } = routeRef.current;
      void runTradeMarketPullRefresh(pulled, p, q);
    },
  });
}
