import { TradeListPageMountProbe } from "@/components/home/TradeListPageMountProbe";
import { MarketContent } from "./MarketContent";

/**
 * `/market` — RSC `await` 로 Suspense 를 걸면 탭 전환마다 fallback 이
 * `CommunityFeedSkeleton`(MainFeedRouteLoading) 으로 440ms 슬라이드에 끼어든다.
 * 본문은 즉시 `MarketContent` + 클라 `peekCachedPostsForHome` 만 사용하고,
 * 시드가 필요하면 `HomeProductList` 가 백그라운드에서 한 번만 채운다.
 */
export default function MarketPage() {
  return (
    <>
      <TradeListPageMountProbe />
      <MarketContent clientFeedInstantBoot />
    </>
  );
}
