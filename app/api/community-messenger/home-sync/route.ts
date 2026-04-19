import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonOkWithRequest } from "@/lib/http/api-route";
import { getCommunityMessengerHomeSyncBundle } from "@/lib/community-messenger/get-community-messenger-home-sync-bundle";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 홈 사일런트 갱신 전용 — `rooms` + `friend-requests` + `friends` 를 한 HTTP 왕복으로 묶어
 * 클라 RTT·Next 핸들러 반복을 줄인다 (`list_bootstrap_align` 측정 구간).
 */
export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:home-sync:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메신저 홈 동기화 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_home_sync_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const bundle = await getCommunityMessengerHomeSyncBundle(auth.userId);
  recordMessengerApiTiming("GET /api/community-messenger/home-sync", Math.round(performance.now() - t0), 200);
  return jsonOkWithRequest(req, bundle);
}
