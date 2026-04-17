import type { NextRequest } from "next/server";
import { Suspense } from "react";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";
import { HomeContent } from "./HomeContent";

/** 피드만 이 경계에서 await — 세션·시드 준비는 `home/loading.tsx`·스트리밍으로 분리 */
async function HomeTradeFeedShell({
  req,
  viewerUserId,
}: {
  req: NextRequest;
  viewerUserId: string | null;
}) {
  const initialHomeTradeFeed = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });
  return (
    <div className="min-h-screen bg-background">
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <HomeContent initialHomeTradeFeed={initialHomeTradeFeed} />
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [req, viewerUserId] = await Promise.all([
    buildHomeTradeSeedRequest(),
    getOptionalAuthenticatedUserId(),
  ]);
  return (
    <Suspense fallback={<MainHomeShellLoading />}>
      <HomeTradeFeedShell req={req} viewerUserId={viewerUserId} />
    </Suspense>
  );
}
