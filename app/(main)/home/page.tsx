import { Suspense } from "react";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { TradeListPageMountProbe } from "@/components/home/TradeListPageMountProbe";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";
import { HomeContent } from "./HomeContent";

/** 피드만 이 경계에서 await — 세션·시드 준비는 `home/loading.tsx`·스트리밍으로 분리 */
async function HomeTradeFeedShell() {
  const [req, viewerUserId] = await Promise.all([
    buildHomeTradeSeedRequest(),
    getOptionalAuthenticatedUserId(),
  ]);
  const initialHomeTradeFeed = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });
  return (
    <div className="min-h-screen bg-background">
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <TradeListPageMountProbe />
        {/** `HomeContent`·`HomeProductList` 의 `useSearchParams()` — 정적 생성 시 Suspense 필수 */}
        <Suspense fallback={<MainHomeShellLoading />}>
          <HomeContent initialHomeTradeFeed={initialHomeTradeFeed} />
        </Suspense>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<MainHomeShellLoading />}>
      <HomeTradeFeedShell />
    </Suspense>
  );
}
