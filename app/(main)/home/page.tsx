import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { buildHomeTradeSeedRequest } from "@/lib/trade/build-home-trade-seed-request";
import { HomeContent } from "./HomeContent";

/** 거래 홈: 첫 피드는 서버에서 `GET /api/home/posts` 와 동일 로직으로 한 번만 조회 */
export default async function HomePage() {
  /** `headers()` 기반 시드 요청과 세션 확정은 서로 독립 — 순차 대기 시 TTFB 만 늘어남 */
  const [req, viewerUserId] = await Promise.all([
    buildHomeTradeSeedRequest(),
    getOptionalAuthenticatedUserId(),
  ]);
  const initialHomeTradeFeed = await resolveHomePostsGetData(req, { precomputedViewerUserId: viewerUserId });

  return (
    <div className="min-h-screen bg-background">
      {/*
        좌우 여백은 `HomeContent` 안 `APP_MAIN_GUTTER_X` 한 겹만 사용.
        (이전: 페이지 padding + TRADE_CONTENT_SHELL -mx/+px 겹침 → 태블릿에서 헤더·탭과 카드 폭이 어긋날 수 있음)
      */}
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <HomeContent initialHomeTradeFeed={initialHomeTradeFeed} />
      </div>
    </div>
  );
}
