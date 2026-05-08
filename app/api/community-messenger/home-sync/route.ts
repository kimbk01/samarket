import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonOkWithRequest } from "@/lib/http/api-route";
import { getCommunityMessengerHomeSyncBundle } from "@/lib/community-messenger/get-community-messenger-home-sync-bundle";
import {
  COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
} from "@/lib/community-messenger/service";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { messengerApiEdgeCacheHeaders } from "@/lib/http/messenger-api-edge-cache";
import v8 from "v8";
import { ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS = 5_000;
/** 사용자당 1키이나 트래픽이 몰릴 때 프로세스 메모리가 비한정 증가하지 않게 */
const COMMUNITY_MESSENGER_HOME_SYNC_CACHE_MAX_ENTRIES = 4_000;

type CommunityMessengerHomeSyncCacheEntry = {
  payload: Awaited<ReturnType<typeof getCommunityMessengerHomeSyncBundle>>;
  expiresAt: number;
};

const communityMessengerHomeSyncCache = new Map<string, CommunityMessengerHomeSyncCacheEntry>();

/**
 * 홈 사일런트 갱신 전용 — `rooms` + `friend-requests` + `friends` 를 한 HTTP 왕복으로 묶어
 * 클라 RTT·Next 핸들러 반복을 줄인다 (`list_bootstrap_align` 측정 구간).
 */
export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const isDev = process.env.NODE_ENV === "development";
  const enableInMemoryCache = process.env.NODE_ENV === "production";
  const tAuth = performance.now();
  const auth = await requireAuthenticatedUserId();
  const authMs = performance.now() - tAuth;
  if (!auth.ok) {
    if (isDev) {
      // 401/403 등은 병목 분석 대상에서 제외(로그로만 분리).
      console.warn("[home-sync-skip]", { status: 401, reason: "unauthenticated" });
    }
    return auth.response;
  }

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:home-sync:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메신저 홈 동기화 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_home_sync_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const tierParam = req.nextUrl.searchParams.get("tier");
  const tier: "critical" | "full" = tierParam === "critical" ? "critical" : "full";
  const now = Date.now();
  const trace: HomeSyncTrace | undefined =
    isDev && tier === "critical"
      ? {
          token: `home-sync:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`,
          authSessionMs: ms(authMs),
          deepSteps: {},
        }
      : undefined;
  if (enableInMemoryCache) {
    pruneByExpiresAtAndMaxSize(
      communityMessengerHomeSyncCache,
      now,
      COMMUNITY_MESSENGER_HOME_SYNC_CACHE_MAX_ENTRIES
    );
  }

  /** 상한·스킵 enrich 변경 시 캐시 오염 방지 — cap 버전을 키에 포함 */
  const cacheKey = `${auth.userId}:${tier}:cap${COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP}f${COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP}`;
  let bundle =
    enableInMemoryCache && !fresh ? communityMessengerHomeSyncCache.get(cacheKey)?.payload : undefined;
  if (!bundle) {
    try {
      bundle = await getCommunityMessengerHomeSyncBundle(auth.userId, tier, { trace });
    } catch (e) {
      if (trace) {
        console.warn("[home-sync-skip]", { status: 500, reason: "bundle_error", token: trace.token });
      }
      throw e;
    }
    const tSet = Date.now();
    if (enableInMemoryCache) {
      communityMessengerHomeSyncCache.set(cacheKey, {
        payload: bundle,
        expiresAt: tSet + COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS,
      });
      pruneByExpiresAtAndMaxSize(
        communityMessengerHomeSyncCache,
        tSet,
        COMMUNITY_MESSENGER_HOME_SYNC_CACHE_MAX_ENTRIES
      );
    }
  }

  // [DEV] payload size log (approx) + heap logger for memory-restart triage.
  try {
    if (isDev) {
      const rooms = (bundle.chats?.length ?? 0) + (bundle.groups?.length ?? 0);
      const friends = bundle.friends?.length ?? 0;
      const requests = bundle.requests?.length ?? 0;

      // [home-sync-size] JSON length (KB)
      const payloadBytes = JSON.stringify(bundle).length;
      console.warn("[home-sync-size]", {
        payloadKB: Math.round(payloadBytes / 1024),
        rooms,
        friends,
        requests,
      });

      console.warn("[home-sync-auth]", { authSessionMs: Math.round(authMs) });

      // [dev-heap] only when heapUsed/heapLimit > 0.7
      const h = v8.getHeapStatistics();
      const used = h.used_heap_size;
      const limit = h.heap_size_limit || 1;
      const ratio = used / limit;
      if (ratio > 0.7) {
        console.warn("[dev-heap] home-sync high heap", {
          heapUsedMB: Math.round(used / 1024 / 1024),
          heapLimitMB: Math.round(limit / 1024 / 1024),
          ratio: Math.round(ratio * 1000) / 1000,
          rooms,
          friends,
          requests,
        });
      }
    }
  } catch {
    /* ignore */
  }

  if (trace) {
    try {
      const participants = trace.deepSteps.participantsProfiles;
      const trade = trace.deepSteps.tradeMetaEnrich;
      const candidates: Array<{ key: string; ms: number; file: string }> = [
        { key: "participantsProfiles.dbFetchMs", ms: ms(participants?.dbFetchMs), file: "lib/community-messenger/service.ts" },
        { key: "participantsProfiles.profileMergeMs", ms: ms(participants?.profileMergeMs), file: "lib/community-messenger/service.ts" },
        { key: "participantsProfiles.participantNormalizeMs", ms: ms(participants?.participantNormalizeMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePostsFetchMs", ms: ms(trade?.tradePostsFetchMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.categoryFetchMs", ms: ms(trade?.categoryFetchMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.sellerProfileAttachMs", ms: ms(trade?.sellerProfileAttachMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.cpuMergeMs", ms: ms(trade?.cpuMergeMs), file: "lib/community-messenger/service.ts" },
      ].filter((c) => c.ms > 0);
      candidates.sort((a, b) => b.ms - a.ms);
      const top = candidates[0];
      console.warn("[home-sync-deep-steps]", {
        token: trace.token,
        authSessionMs: ms(trace.authSessionMs),
        participantsProfiles: participants ?? null,
        tradeMetaEnrich: trade ?? null,
        sellerProfileAttachBreakdown: trade?.sellerProfileAttach ?? null,
        topBottleneck: top ? { key: top.key, ms: Math.round(top.ms) } : null,
        fixCandidateFile: top?.file ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  recordMessengerApiTiming("GET /api/community-messenger/home-sync", Math.round(performance.now() - t0), 200);
  return jsonOkWithRequest(req, bundle, { headers: messengerApiEdgeCacheHeaders() });
}
