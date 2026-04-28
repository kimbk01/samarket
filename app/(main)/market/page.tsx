import { Suspense } from "react";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { TradeListPageMountProbe } from "@/components/home/TradeListPageMountProbe";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";
import { HomeContent } from "../home/HomeContent";

/** Trade all list: server seed + client hydration without extra first network round-trip. */
async function MarketTradeFeedShell() {
  const [req, viewerUserId] = await Promise.all([
    buildHomeTradeSeedRequest(),
    getOptionalAuthenticatedUserId(),
  ]);
  const initialHomeTradeFeed = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });
  return (
    <div className="min-h-screen bg-sam-app">
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <TradeListPageMountProbe />
        <Suspense fallback={<MainHomeShellLoading />}>
          <HomeContent initialHomeTradeFeed={initialHomeTradeFeed} />
        </Suspense>
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<MainHomeShellLoading />}>
      <MarketTradeFeedShell />
    </Suspense>
  );
}
