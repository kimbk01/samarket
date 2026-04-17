import type { NextRequest } from "next/server";
import { Suspense } from "react";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";
import { HomeContent } from "./HomeContent";

/** 피드만 이 경계에서 await — `(main)/loading` 이 전체 피드 완료까지 막히지 않게 한다. */
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

/** `headers()`·세션만 먼저 병렬 — 피드는 내부 Suspense */
async function HomePageBody() {
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

export default function HomePage() {
  return (
    <Suspense fallback={<MainHomeShellLoading />}>
      <HomePageBody />
    </Suspense>
  );
}
