import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { getCommunityMessengerBootstrap, listCommunityMessengerCallLogs } from "@/lib/community-messenger/service";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";

const COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS = 8_000;

type CommunityMessengerBootstrapCacheEntry = {
  payload: Awaited<ReturnType<typeof getCommunityMessengerBootstrap>>;
  expiresAt: number;
};

const communityMessengerBootstrapCache = new Map<string, CommunityMessengerBootstrapCacheEntry>();

export async function GET(request: NextRequest) {
  const t0 = performance.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:bootstrap:${getRateLimitKey(request, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메신저 초기 데이터 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_bootstrap_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  /** 첫 페인트 이후 통화 기록만 합류 — `listCommunityMessengerCallLogs` 단일 경로 */
  if (request.nextUrl.searchParams.get("callsLog") === "1") {
    const t1 = performance.now();
    const calls = await listCommunityMessengerCallLogs(auth.userId);
    recordMessengerApiTiming(
      "GET /api/community-messenger/bootstrap?callsLog=1",
      Math.round(performance.now() - t1),
      200
    );
    return NextResponse.json({ ok: true, calls, tabs: { calls: calls.length } });
  }

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const lite = request.nextUrl.searchParams.get("lite") === "1";
  const cacheKey = `${auth.userId}:${lite ? "lite" : "full"}`;
  for (const [key, entry] of communityMessengerBootstrapCache) {
    if (entry.expiresAt <= Date.now()) {
      communityMessengerBootstrapCache.delete(key);
    }
  }

  let data = communityMessengerBootstrapCache.get(cacheKey)?.payload;
  if (!data || fresh) {
    data = await getCommunityMessengerBootstrap(auth.userId, {
      skipDiscoverable: lite,
      deferCallLog: lite,
    });
    communityMessengerBootstrapCache.set(cacheKey, {
      payload: data,
      expiresAt: Date.now() + COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS,
    });
  }
  recordMessengerApiTiming("GET /api/community-messenger/bootstrap", Math.round(performance.now() - t0), 200);
  return NextResponse.json({ ok: true, ...data });
}
