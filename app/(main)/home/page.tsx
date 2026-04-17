import { Suspense } from "react";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";
import { HomeContent } from "./HomeContent";

/** 거래 홈: 첫 피드는 서버에서 `GET /api/home/posts` 와 동일 로직으로 한 번만 조회 */
async function HomePageBody() {
  const [req, viewerUserId] = await Promise.all([
    buildHomeTradeSeedRequest(),
    getOptionalAuthenticatedUserId(),
  ]);
  const initialHomeTradeFeed = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });

  return (
    <div className="min-h-screen bg-background">
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <HomeContent initialHomeTradeFeed={initialHomeTradeFeed} />
      </div>
    </div>
  );
}

/**
 * 피드·시드 조회는 Suspense 안쪽에서만 await — 탭 전환 시 상위 `loading`·스트리밍 경계가 먼저 잡힌다.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<MainHomeShellLoading />}>
      <HomePageBody />
    </Suspense>
  );
}
