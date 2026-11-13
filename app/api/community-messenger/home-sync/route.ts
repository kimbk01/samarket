import { NextRequest, NextResponse } from "next/server";
import { HomeSyncSnapshotUnavailableError } from "@/lib/community-messenger/home-sync-snapshot";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonOkWithRequest } from "@/lib/http/api-route";
import { requireMessengerOpenAccess } from "@/lib/profile/require-profile-completion.server";
import type { CommunityMessengerHomeSyncBundlePayload } from "@/lib/community-messenger/get-community-messenger-home-sync-bundle";
import {
  COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
} from "@/lib/community-messenger/home-sync-room-caps";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/messenger-api-route-timing";
import { messengerApiEdgeCacheHeaders } from "@/lib/http/messenger-api-edge-cache";
import { homeSyncBreakdownEnabled } from "@/lib/community-messenger/home-sync-breakdown-log";
import {
  homeSyncRequestDedupeKey,
  recordHomeSyncCompletion,
} from "@/lib/community-messenger/home-sync-duplicate-window";
import {
  buildHomeSyncOutsideTradeStepBreakdown,
  buildHomeSyncTradeMetaStepBreakdown,
  homeSyncTraceMeterEnabled,
  mergeHomeSyncDeepStepsAfterSingleflightJoin,
  ms,
  type HomeSyncDeepStepsBundleSteps,
  type HomeSyncDeepStepsUnreadBadge,
  type HomeSyncTrace,
} from "@/lib/community-messenger/home-sync-trace";
import { recordHomeSyncCriticalRouteSnapshot } from "@/lib/community-messenger/home-sync-critical-route-snapshot";
import {
  homeSyncFullAnalysisEnabled,
  logHomeSyncFullAnalysis,
} from "@/lib/community-messenger/home-sync-full-analysis-log";
import {
  messengerTraceConsoleDebug,
  messengerVerboseTraceConsoleEnabled,
} from "@/lib/community-messenger/messenger-trace-console";
import { logPerfMeasurementContext } from "@/lib/http/perf-measurement-context";
import { buildSnapshotSignoffHeaders } from "@/lib/http/snapshot-signoff-response-headers";
import {
  homeSyncRouteMemoryTtlObs,
  peekLastHomeSyncRouteObservability,
} from "@/lib/community-messenger/home-sync-route-observability";
import type { SnapshotSignoffObs } from "@/lib/http/snapshot-signoff-response-headers";
import {
  homeSyncDeepTraceLogEnabled,
  logHomeSyncDeepTrace,
} from "@/lib/community-messenger/home-sync-deep-trace-log";
import { emitHomeSyncRuntimeProfile } from "@/lib/community-messenger/home-sync-runtime-profile";
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveCmHomeCutoverGateRuntimeMeta } from "@/lib/community-messenger/home/cm-home-cutover-gate-db";
import { CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY } from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS = 5_000;
/** fresh TTL 만료 후에도 응답은 즉시 반환하고 백그라운드에서 번들 재생(stale-while-revalidate) */
const COMMUNITY_MESSENGER_HOME_SYNC_STALE_MS = 30_000;
/** 사용자당 1키이나 트래픽이 몰릴 때 프로세스 메모리가 비한정 증가하지 않게 */
const COMMUNITY_MESSENGER_HOME_SYNC_CACHE_MAX_ENTRIES = 4_000;

type HomeSyncRouteCacheTraceSnapshot = {
  bundleStepsPartial: Partial<HomeSyncDeepStepsBundleSteps>;
  unreadPartial: Partial<HomeSyncDeepStepsUnreadBadge>;
  sourceToken: string;
};

function captureHomeSyncRouteCacheTraceSnapshot(trace: HomeSyncTrace): HomeSyncRouteCacheTraceSnapshot | undefined {
  if (!homeSyncTraceMeterEnabled(trace)) return undefined;
  const bs = trace.deepSteps.bundleSteps ?? {};
  const ur = trace.deepSteps.unreadHomeSyncSteps ?? {};
  return {
    sourceToken: trace.token,
    bundleStepsPartial: {
      bundleTotalMs: bs.bundleTotalMs,
      tradeMetaEnrichTotalMs: bs.tradeMetaEnrichTotalMs,
      outsideTradeEnrichMs: bs.outsideTradeEnrichMs,
      roomsFetchMs: bs.roomsFetchMs,
      roomSliceCpuMs: bs.roomSliceCpuMs,
      roomIdsDedupeMs: bs.roomIdsDedupeMs,
      participantsProfilesMs: bs.participantsProfilesMs,
      summarizeRoomsMs: bs.summarizeRoomsMs,
      unreadBadgeMs: bs.unreadBadgeMs,
      payloadBuildMs: bs.payloadBuildMs,
      listSplitFilterMs: bs.listSplitFilterMs,
      listMyChatsWallMs: bs.listMyChatsWallMs,
      roomsRound2RoomsDbFetchMs: bs.roomsRound2RoomsDbFetchMs,
      bundleParallelWallMs: bs.bundleParallelWallMs,
      friendsFetchMs: bs.friendsFetchMs,
      friendsRequestsFetchMs: bs.friendsRequestsFetchMs,
    },
    unreadPartial: { ...ur },
  };
}

function mergeHomeSyncTraceFromRouteCache(trace: HomeSyncTrace, snap: HomeSyncRouteCacheTraceSnapshot): void {
  trace.deepSteps.bundleSteps = {
    ...(trace.deepSteps.bundleSteps ?? {}),
    ...snap.bundleStepsPartial,
    bundleReplayFromProcessCache: true,
    bundleListRebuildSkipReason: "route_in_process_ttl_5s_cache",
  };
  trace.deepSteps.unreadHomeSyncSteps = {
    ...(trace.deepSteps.unreadHomeSyncSteps ?? {}),
    ...snap.unreadPartial,
    unreadSkipReason: "replayed_from_route_in_process_ttl_cache",
  };
}

type CommunityMessengerHomeSyncCacheEntry = {
  payload: CommunityMessengerHomeSyncBundlePayload;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
  traceSnapshot?: HomeSyncRouteCacheTraceSnapshot;
};

const communityMessengerHomeSyncCache = new Map<string, CommunityMessengerHomeSyncCacheEntry>();

/** single-flight 합류 시 leader trace 복원용 */
const homeSyncInflightLeaderTraces = new Map<string, HomeSyncTrace>();

function pruneHomeSyncRouteCache(now: number): void {
  for (const [key, entry] of communityMessengerHomeSyncCache) {
    if (entry.staleUntil <= now) communityMessengerHomeSyncCache.delete(key);
  }
  while (communityMessengerHomeSyncCache.size > COMMUNITY_MESSENGER_HOME_SYNC_CACHE_MAX_ENTRIES) {
    const first = communityMessengerHomeSyncCache.keys().next().value;
    if (first === undefined) break;
    communityMessengerHomeSyncCache.delete(first);
  }
}

function homeSyncBundleFlightKey(cacheKey: string): string {
  return `community-messenger:home-sync-bundle:${cacheKey}`;
}

async function loadHomeSyncBundle(
  userId: string,
  tier: "critical" | "full",
  trace: HomeSyncTrace | undefined
): Promise<CommunityMessengerHomeSyncBundlePayload> {
  const tDynamicImport = performance.now();
  const { getCommunityMessengerHomeSyncBundle } = await import(
    "@/lib/community-messenger/get-community-messenger-home-sync-bundle"
  );
  const routeBundleDynamicImportMs = performance.now() - tDynamicImport;
  if (trace && homeSyncTraceMeterEnabled(trace)) {
    trace.deepSteps.bundleSteps = {
      ...(trace.deepSteps.bundleSteps ?? {}),
      routeBundleDynamicImportMs: ms(routeBundleDynamicImportMs),
    };
  }
  return getCommunityMessengerHomeSyncBundle(userId, tier, { trace });
}

function scheduleHomeSyncStaleRevalidate(
  cacheKey: string,
  userId: string,
  tier: "critical" | "full"
): void {
  void runSingleFlight(`home-sync-swr:${cacheKey}`, async () => {
    const bundle = await loadHomeSyncBundle(userId, tier, undefined);
    const now = Date.now();
    communityMessengerHomeSyncCache.set(cacheKey, {
      payload: bundle,
      storedAt: now,
      freshUntil: now + COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS,
      staleUntil: now + COMMUNITY_MESSENGER_HOME_SYNC_STALE_MS,
    });
    return bundle;
  });
}

/**
 * 홈 사일런트 갱신 전용 — `rooms` + `friend-requests` + `friends` 를 한 HTTP 왕복으로 묶어
 * 클라 RTT·Next 핸들러 반복을 줄인다 (`list_bootstrap_align` 측정 구간).
 */
export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const isDev = process.env.NODE_ENV === "development";
  /** 짧은 TTL in-process 캐시 — dev 포함 기본 ON, `SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE=1` 로만 끔 */
  const enableInMemoryCache = process.env.SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE !== "1";
  const tAuth = performance.now();
  const auth = await requireAuthenticatedUserId();
  const authMs = performance.now() - tAuth;
  if (!auth.ok) {
    if (isDev) {
      // 401/403 등은 병목 분석 대상에서 제외(로그로만 분리).
      messengerTraceConsoleDebug("[home-sync-skip]", { status: 401, reason: "unauthenticated" });
    }
    return auth.response;
  }

  const profileGate = await requireMessengerOpenAccess(auth.userId);
  if (!profileGate.ok) return profileGate.response;

  const tRate0 = performance.now();
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:home-sync:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메신저 홈 동기화 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_home_sync_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const tPostRateLimit = performance.now();
  const rateLimitWallMs = tPostRateLimit - tRate0;

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const tierParam = req.nextUrl.searchParams.get("tier");
  const tier: "critical" | "full" = tierParam === "critical" ? "critical" : "full";
  /** 서버 터미널 전용 — 브라우저 DevTools Console 아님. 매 요청 1줄로 라우트 진입 확인 */
  console.log("[home-sync-request]", {
    tier,
    fresh: fresh ? 1 : 0,
    user_id_prefix: auth.userId.slice(0, 8),
  });
  const now = Date.now();
  /**
   * critical tier: **항상** trace + 비어 있지 않은 `token` 으로 service `homeSyncTraceMeterEnabled` 계측이 켜지게 한다.
   * (과거 prod 에서 `token: ""` 이면 bundleSteps·unread ms 가 전부 0으로 남던 불일치 방지)
   * dev + full tier: bundleSteps·unread 세분(프로덕션 full 은 trace 없음 유지).
   */
  const trace: HomeSyncTrace | undefined =
    tier === "critical"
      ? {
          token: `home-sync-crit:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`,
          tier: "critical",
          authSessionMs: ms(authMs),
          deepSteps: {},
        }
      : isDev
        ? {
            token: `home-sync-full:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`,
            tier: "full",
            authSessionMs: ms(authMs),
            deepSteps: {},
          }
        : undefined;
  if (enableInMemoryCache) {
    pruneHomeSyncRouteCache(now);
  }

  /** 상한·스킵 enrich 변경 시 캐시 오염 방지 — cap 버전을 키에 포함 */
  const cacheKey = `${auth.userId}:${tier}:cap${COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP}f${COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP}`;
  const duplicateDedupeKey = `${auth.userId}|${homeSyncRequestDedupeKey(req.nextUrl.pathname, req.nextUrl.searchParams)}`;
  /** 번들 miss + in-flight 합류 시 `home_sync_cache_reason` 등에 사용 */
  let homeSyncSingleflightJoined = false;
  const tCacheLookup = performance.now();
  const cachedEntry: CommunityMessengerHomeSyncCacheEntry | undefined =
    enableInMemoryCache && !fresh ? communityMessengerHomeSyncCache.get(cacheKey) : undefined;
  const homeSyncCacheLookupMs = performance.now() - tCacheLookup;
  let bundle: CommunityMessengerHomeSyncBundlePayload | undefined;
  let shortTtlHit = false;
  let staleWhileRevalidateServe = false;
  let replayFromProcessCache = false;
  if (cachedEntry && enableInMemoryCache && !fresh) {
    const ageMs = Math.max(0, now - cachedEntry.storedAt);
    if (now < cachedEntry.freshUntil) {
      bundle = cachedEntry.payload;
      shortTtlHit = true;
      replayFromProcessCache = true;
    } else if (now < cachedEntry.staleUntil) {
      bundle = cachedEntry.payload;
      shortTtlHit = true;
      staleWhileRevalidateServe = true;
      replayFromProcessCache = true;
      scheduleHomeSyncStaleRevalidate(cacheKey, auth.userId, tier);
    }
  }
  const homeSyncCacheApproxAgeMs =
    shortTtlHit && cachedEntry ? Math.max(0, now - cachedEntry.storedAt) : null;
  let homeSyncCacheStoreMs = 0;

  const tBeforeBundleResolution = performance.now();
  let routeBundleAwaitMs = 0;
  let routeDevDiagnosticsMs = 0;
  /** dev: `[home-sync-breakdown]` 에서 재사용해 이중 JSON.stringify 방지 */
  let devPayloadBytes = 0;
  let devPayloadSerializeMs = 0;
  if (trace) {
    trace.deepSteps.bundleSteps = {
      ...(trace.deepSteps.bundleSteps ?? {}),
      routeAuthWallMs: ms(authMs),
      routeRateLimitWallMs: ms(rateLimitWallMs),
      routePreBundleMs: ms(tBeforeBundleResolution - tPostRateLimit),
    };
  }

  if (!bundle) {
    try {
      const flightKey = homeSyncBundleFlightKey(cacheKey);
      const inflightBefore = getSingleFlightPromise<CommunityMessengerHomeSyncBundlePayload>(flightKey);
      if (inflightBefore) {
        homeSyncSingleflightJoined = true;
      } else if (trace) {
        homeSyncInflightLeaderTraces.set(cacheKey, trace);
      }
      const tAwaitStart = performance.now();
      bundle = await runSingleFlight(flightKey, () => loadHomeSyncBundle(auth.userId, tier, trace));
      routeBundleAwaitMs = performance.now() - tAwaitStart;
      const leaderTrace = homeSyncInflightLeaderTraces.get(cacheKey);
      homeSyncInflightLeaderTraces.delete(cacheKey);
      if (homeSyncSingleflightJoined && trace && leaderTrace) {
        mergeHomeSyncDeepStepsAfterSingleflightJoin(trace, leaderTrace, routeBundleAwaitMs);
      }
    } catch (e) {
      if (e instanceof HomeSyncSnapshotUnavailableError) {
        if (trace) {
          console.warn("[home-sync-skip]", {
            status: 503,
            reason: "snapshot_unavailable",
            detail: e.reason,
            token: trace.token,
          });
        }
        return NextResponse.json(
          { ok: false, error: "snapshot_unavailable" },
          {
            status: 503,
            headers: {
              ...messengerApiEdgeCacheHeaders(),
              "x-samarket-home-sync-fallback-used": "0",
            },
          }
        );
      }
      if (trace) {
        console.warn("[home-sync-skip]", { status: 500, reason: "bundle_error", token: trace.token });
      }
      throw e;
    }
    const tSet = Date.now();
    if (enableInMemoryCache) {
      const tStore0 = performance.now();
      communityMessengerHomeSyncCache.set(cacheKey, {
        payload: bundle,
        storedAt: tSet,
        freshUntil: tSet + COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS,
        staleUntil: tSet + COMMUNITY_MESSENGER_HOME_SYNC_STALE_MS,
        traceSnapshot: trace ? captureHomeSyncRouteCacheTraceSnapshot(trace) : undefined,
      });
      homeSyncCacheStoreMs = performance.now() - tStore0;
      pruneHomeSyncRouteCache(tSet);
    }
  } else if (trace && cachedEntry?.traceSnapshot) {
    mergeHomeSyncTraceFromRouteCache(trace, cachedEntry.traceSnapshot);
  }

  // [DEV] payload size + heap — 상세 트레이스 켠 경우에만(매 요청 JSON.stringify 제거로 라우트 벽시계 절감)
  try {
    if (isDev && messengerVerboseTraceConsoleEnabled()) {
      const tDiag = performance.now();
      const rooms = (bundle.chats?.length ?? 0) + (bundle.groups?.length ?? 0);
      const friends = bundle.friends?.length ?? 0;
      const requests = bundle.requests?.length ?? 0;

      // [home-sync-size] JSON length (KB)
      const tJson = performance.now();
      devPayloadBytes = JSON.stringify(bundle).length;
      devPayloadSerializeMs = performance.now() - tJson;
      messengerTraceConsoleDebug("[home-sync-size]", {
        payloadKB: Math.round(devPayloadBytes / 1024),
        rooms,
        friends,
        requests,
        jsonStringifyMs: Math.round(devPayloadSerializeMs),
      });

      messengerTraceConsoleDebug("[home-sync-auth]", { authSessionMs: Math.round(authMs) });

      // [dev-heap] only when heapUsed/heapLimit > 0.7 — `node:v8` 는 cold compile 그래프에서 분리(동적 import)
      const { getHeapStatistics } = await import("node:v8");
      const h = getHeapStatistics();
      const used = h.used_heap_size;
      const limit = h.heap_size_limit || 1;
      const ratio = used / limit;
      if (ratio > 0.7) {
        messengerTraceConsoleDebug("[dev-heap] home-sync high heap", {
          heapUsedMB: Math.round(used / 1024 / 1024),
          heapLimitMB: Math.round(limit / 1024 / 1024),
          ratio: Math.round(ratio * 1000) / 1000,
          rooms,
          friends,
          requests,
        });
      }
      routeDevDiagnosticsMs = performance.now() - tDiag;
    }
  } catch {
    /* ignore */
  }

  if (trace && messengerVerboseTraceConsoleEnabled()) {
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
        { key: "tradeMetaEnrich.directKeys.wallMs", ms: ms(trade?.directKeys?.wallMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePcBridgeQueriesMs", ms: ms(trade?.tradePcBridgeQueriesMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.seedProductChatsMs", ms: ms(trade?.seedProductChatsMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.residualGapAfterCategoryMs", ms: ms(trade?.residualGapAfterCategoryMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePcBridgeBreakdown.phaseDPairPcMs", ms: ms(trade?.tradePcBridgeBreakdown?.phaseDPairPcMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePcBridgeBreakdown.phaseBPcByRoomMs", ms: ms(trade?.tradePcBridgeBreakdown?.phaseBPcByRoomMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePcBridgeBreakdown.phaseCLedgerMs", ms: ms(trade?.tradePcBridgeBreakdown?.phaseCLedgerMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.tradePcBridgeBreakdown.phaseCPcCandidatesMs", ms: ms(trade?.tradePcBridgeBreakdown?.phaseCPcCandidatesMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.explainedComponentsDetail.phaseBSyncMapCpuMs", ms: ms(trade?.explainedComponentsDetail?.phaseBSyncMapCpuMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.explainedComponentsDetail.phaseCSyncLedgerMapCpuMs", ms: ms(trade?.explainedComponentsDetail?.phaseCSyncLedgerMapCpuMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.explainedComponentsDetail.phaseCSyncPcTripleCpuMs", ms: ms(trade?.explainedComponentsDetail?.phaseCSyncPcTripleCpuMs), file: "lib/community-messenger/service.ts" },
        { key: "tradeMetaEnrich.explainedComponentsDetail.phaseAPrePostsSyncCpuMs", ms: ms(trade?.explainedComponentsDetail?.phaseAPrePostsSyncCpuMs), file: "lib/community-messenger/service.ts" },
        {
          key: "tradeMetaEnrich.explainedComponentsDetail.tradeEnrichPhaseTargetsPrepCpuMs",
          ms: ms(trade?.explainedComponentsDetail?.tradeEnrichPhaseTargetsPrepCpuMs),
          file: "lib/community-messenger/service.ts",
        },
        { key: "tradeMetaEnrich.explainedComponentsDetail.phaseDFinalMergeCpuMs", ms: ms(trade?.explainedComponentsDetail?.phaseDFinalMergeCpuMs), file: "lib/community-messenger/service.ts" },
        {
          key: "tradeMetaBuildFromPostDetail.messengerSnapshotCpuMs",
          ms: ms(trace.deepSteps.tradeMetaBuildFromPostDetail?.messengerSnapshotCpuMs),
          file: "lib/community-messenger/service.ts",
        },
        {
          key: "tradeMetaBuildFromPostDetail.categoryMenuLabelCpuMs",
          ms: ms(trace.deepSteps.tradeMetaBuildFromPostDetail?.categoryMenuLabelCpuMs),
          file: "lib/community-messenger/service.ts",
        },
        {
          key: "tradeMetaBuildFromPostDetail.headlineCpuMs",
          ms: ms(trace.deepSteps.tradeMetaBuildFromPostDetail?.headlineCpuMs),
          file: "lib/community-messenger/service.ts",
        },
      ].filter((c) => c.ms > 0);
      candidates.sort((a, b) => b.ms - a.ms);
      const top = candidates[0];
      messengerTraceConsoleDebug("[home-sync-deep-steps]", {
        token: trace.token,
        authSessionMs: ms(trace.authSessionMs),
        participantsProfiles: participants ?? null,
        tradeMetaBuildFromPostDetail: trace.deepSteps.tradeMetaBuildFromPostDetail ?? null,
        tradeMetaEnrich: trade ?? null,
        tradeCategoryFetchMode: trade?.tradeCategoryFetchMode ?? null,
        categoryDbSkipped: trade?.categoryDbSkipped ?? null,
        explainedComponentsMs: trade?.explainedComponentsMs ?? null,
        explainedPlusCategoryParallelMs: trade?.explainedPlusCategoryParallelMs ?? null,
        residualGapAfterCategoryMs: trade?.residualGapAfterCategoryMs ?? null,
        gapMs: trade?.gapMs ?? null,
        explainedComponentsDetail: trade?.explainedComponentsDetail ?? null,
        perfNote:
          "trade enrich 계측 v7-16: category fetch counters→slice spread 제거·queryMs만 ms 후 참조로 trace 저장.",
        sellerProfileAttachBreakdown: trade?.sellerProfileAttach ?? null,
        topBottleneck: top ? { key: top.key, ms: Math.round(top.ms) } : null,
        fixCandidateFile: top?.file ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  const routeTotalMsVal = performance.now() - t0;
  const routeHandlerMsVal = routeTotalMsVal - routeBundleAwaitMs;

  if (trace) {
    trace.deepSteps.bundleSteps = {
      ...(trace.deepSteps.bundleSteps ?? {}),
      routeBundleAwaitMs: ms(routeBundleAwaitMs),
      routeDevDiagnosticsMs: ms(routeDevDiagnosticsMs),
      routeTotalMs: ms(routeTotalMsVal),
      routeHandlerMs: ms(routeHandlerMsVal),
      routeOutsideBundleAwaitMs: ms(routeHandlerMsVal),
    };
    const bundleWallForGap = ms(trace.deepSteps.bundleSteps?.bundleTotalMs ?? 0);
    const routeAwaitRounded = ms(routeBundleAwaitMs);
    const gapAwaitVsBundle = Math.abs(routeAwaitRounded - bundleWallForGap);
    if (homeSyncTraceMeterEnabled(trace) && gapAwaitVsBundle > 50 && messengerVerboseTraceConsoleEnabled()) {
      try {
        messengerTraceConsoleDebug("[home-sync-trace-gap]", {
          token: trace.token,
          tier,
          short_ttl_hit: shortTtlHit,
          routeBundleAwaitMs: routeAwaitRounded,
          bundleTotalMs: bundleWallForGap,
          gap_ms: gapAwaitVsBundle,
          explain:
            "routeBundleAwaitMs=getCommunityMessengerHomeSyncBundle await; bundleTotalMs=get-bundle wall. 큰 차이는 dev JSON·heap 진단, in-process TTL 캐시 재생, 또는 번들 rollup 이 await 이후에만 채워지는 경우를 의심.",
        });
      } catch {
        /* ignore */
      }
    }
    if (isDev && homeSyncTraceMeterEnabled(trace) && messengerVerboseTraceConsoleEnabled()) {
      try {
        const bs0 = trace.deepSteps.bundleSteps ?? {};
        const wallSplitSample = {
          note:
            "동일 조건에서 3샘플을 비교해 route wall vs bundle wall 소비를 확인하세요.",
          token: trace.token,
          tier,
          short_ttl_hit: shortTtlHit,
          cache_source_token: cachedEntry?.traceSnapshot?.sourceToken ?? null,
          route_total_ms: ms(routeTotalMsVal),
          route_auth_ms: bs0.routeAuthWallMs ?? null,
          route_rate_limit_ms: bs0.routeRateLimitWallMs ?? null,
          route_pre_bundle_ms: bs0.routePreBundleMs ?? null,
          route_bundle_await_ms: bs0.routeBundleAwaitMs ?? null,
          route_dev_diagnostics_ms: bs0.routeDevDiagnosticsMs ?? null,
          bundle_total_ms: bs0.bundleTotalMs ?? null,
          rooms_fetch_ms: bs0.roomsFetchMs ?? null,
          unread_badge_ms: bs0.unreadBadgeMs ?? null,
          unread_skip_reason: trace.deepSteps.unreadHomeSyncSteps?.unreadSkipReason ?? null,
          bundle_list_rebuild_skip: bs0.bundleListRebuildSkipReason ?? null,
        };
        messengerTraceConsoleDebug("[home-sync-route-wall-split]", {
          total_samples: 3,
          samples: [1, 2, 3].map((sample_index) => ({ sample_index, ...wallSplitSample })),
        });
      } catch {
        /* ignore */
      }
    }
    const bs = trace.deepSteps.bundleSteps;
    const bottleneckCandidates: Array<[string, number]> = [
      ["roomsFetchMs", bs.roomsFetchMs ?? 0],
      ["roomSliceCpuMs", bs.roomSliceCpuMs ?? 0],
      ["roomIdsDedupeMs", bs.roomIdsDedupeMs ?? 0],
      ["participantsProfilesMs", bs.participantsProfilesMs ?? 0],
      ["summarizeRoomsMs", bs.summarizeRoomsMs ?? 0],
      ["unreadBadgeMs", bs.unreadBadgeMs ?? 0],
      ["payloadBuildMs", bs.payloadBuildMs ?? 0],
      ["friendsFetchMs", bs.friendsFetchMs ?? 0],
      ["friendsRequestsFetchMs", bs.friendsRequestsFetchMs ?? 0],
      ["routePreBundleMs", bs.routePreBundleMs ?? 0],
      ["routeDevDiagnosticsMs", bs.routeDevDiagnosticsMs ?? 0],
      ["routeHandlerMs", bs.routeHandlerMs ?? 0],
    ];
    let topOutside: { key: string; ms: number } | null = null;
    for (const [key, v] of bottleneckCandidates) {
      const rounded = ms(v);
      if (!topOutside || rounded > topOutside.ms) topOutside = { key, ms: rounded };
    }
    messengerTraceConsoleDebug("[home-sync-bundle-steps]", {
      token: trace.token,
      tier,
      bundleTotalMs: bs.bundleTotalMs ?? 0,
      tradeMetaEnrichTotalMs: bs.tradeMetaEnrichTotalMs ?? 0,
      outsideTradeEnrichMs: bs.outsideTradeEnrichMs ?? 0,
      roomsFetchMs: bs.roomsFetchMs ?? 0,
      participantsProfilesMs: bs.participantsProfilesMs ?? 0,
      friendsRequestsMs: bs.friendsRequestsFetchMs ?? 0,
      friendsFetchMs: bs.friendsFetchMs ?? 0,
      unreadBadgeMs: bs.unreadBadgeMs ?? 0,
      payloadBuildMs: bs.payloadBuildMs ?? 0,
      summarizeRoomsMs: bs.summarizeRoomsMs ?? 0,
      roomSliceCpuMs: bs.roomSliceCpuMs ?? 0,
      roomIdsDedupeMs: bs.roomIdsDedupeMs ?? 0,
      listSplitFilterMs: bs.listSplitFilterMs ?? 0,
      listMyChatsWallMs: bs.listMyChatsWallMs ?? 0,
      bundleParallelWallMs: bs.bundleParallelWallMs ?? 0,
      routePreBundleMs: bs.routePreBundleMs ?? 0,
      routeBundleAwaitMs: bs.routeBundleAwaitMs ?? 0,
      routeDevDiagnosticsMs: bs.routeDevDiagnosticsMs ?? 0,
      routeHandlerMs: bs.routeHandlerMs ?? 0,
      routeTotalMs: bs.routeTotalMs ?? 0,
      topOutsideBottleneck: topOutside && topOutside.ms > 0 ? topOutside : null,
      bundle_replay_from_process_cache: bs.bundleReplayFromProcessCache ?? false,
      bundle_list_rebuild_skip: bs.bundleListRebuildSkipReason ?? null,
      route_auth_ms: bs.routeAuthWallMs ?? null,
      route_rate_limit_ms: bs.routeRateLimitWallMs ?? null,
    });

    const tradeMeta = trace.deepSteps.tradeMetaEnrich;
    if (tradeMeta) {
      const tm = buildHomeSyncTradeMetaStepBreakdown(tradeMeta, trace.deepSteps.tradeMetaBuildFromPostDetail);
      const tpfd = trace.deepSteps.tradePostsFetchDetail;
      const split = trace.deepSteps.tradePostsResolvedSplit;
      const lightDenom = split?.lightFetchPostIdsTotal ?? 0;
      const imagesPatchPostIdRatio =
        lightDenom > 0 ? Math.round(((split?.patchPostIdsTotal ?? 0) / lightDenom) * 1000) / 1000 : null;
      messengerTraceConsoleDebug("[home-sync-trade-meta-steps]", {
        token: trace.token,
        tier,
        tradeMetaEnrichTotalMs: tm.tradeMetaEnrichTotalMs,
        steps: tm.steps,
        topTradeMetaBottleneck: tm.topTradeMetaBottleneck,
        tradePostsQueryCount: tpfd?.queryCount ?? null,
        tradePostsSchemaFallbackAttempts: tpfd?.fallbackAttemptCount ?? null,
        tradePostsResolvedSplit: split ?? null,
        imagesPatchPostIdRatio,
      });
    }
    const ot = buildHomeSyncOutsideTradeStepBreakdown(bs);
    messengerTraceConsoleDebug("[home-sync-outside-trade-steps]", {
      token: trace.token,
      tier,
      outsideTradeEnrichMs: ot.outsideTradeEnrichMs,
      steps: ot.steps,
      sumListedOutsideStepsMs: ot.sumListedOutsideStepsMs,
      outsideRollupVsSumDeltaMs: ot.outsideRollupVsSumDeltaMs,
      topOutsideTradeEnrichBottleneck: ot.topOutsideTradeEnrichBottleneck,
    });

    const ur = trace.deepSteps.unreadHomeSyncSteps;
    if (isDev && ur) {
      const inv = ur.enrichInvocationCount ?? 0;
      const unreadDuplicateFetchCount = Math.max(0, inv - 1);
      const unreadCandidates: Array<[string, number]> = [
        ["unreadSourceFetchMs", ur.unreadSourceFetchMs ?? 0],
        ["legacyChatRoomsFetchMs", ur.legacyChatRoomsFetchMs ?? 0],
        ["legacyProductChatsFetchMs", ur.legacyProductChatsFetchMs ?? 0],
        ["participantUnreadMs", ur.participantUnreadMs ?? 0],
        ["legacyTradeUnreadMs", ur.legacyTradeUnreadMs ?? 0],
        ["ownerHubBadgeMs", ur.ownerHubBadgeMs ?? 0],
        ["badgeAttachCpuMs", ur.badgeAttachCpuMs ?? 0],
        ["roomIdDedupeMs", ur.roomIdDedupeMs ?? 0],
      ];
      let topUnread: { key: string; ms: number } | null = null;
      for (const [key, v] of unreadCandidates) {
        const rounded = ms(v);
        if (!topUnread || rounded > topUnread.ms) topUnread = { key, ms: rounded };
      }
      messengerTraceConsoleDebug("[home-sync-unread-steps]", {
        token: trace.token,
        tier,
        unreadBadgeMs: ur.unreadBadgeMs ?? 0,
        unreadSourceFetchMs: ur.unreadSourceFetchMs ?? 0,
        legacyChatRoomsFetchMs: ur.legacyChatRoomsFetchMs ?? 0,
        legacyProductChatsFetchMs: ur.legacyProductChatsFetchMs ?? 0,
        unreadParallelWallMs: ur.unreadParallelWallMs ?? ur.unreadSourceFetchMs ?? 0,
        unreadEffectiveRttCount: ur.unreadEffectiveRttCount ?? null,
        unreadLegacyFetchPath: ur.unreadLegacyFetchPath ?? null,
        unreadRpcBundleMs: ur.unreadRpcBundleMs ?? null,
        unreadRpcTotalMs: ur.unreadRpcTotalMs ?? null,
        unreadRpcChatRoomsMs: ur.unreadRpcChatRoomsMs ?? null,
        unreadRpcProductChatsMs: ur.unreadRpcProductChatsMs ?? null,
        unreadRpcMergeMs: ur.unreadRpcMergeMs ?? null,
        unreadRpcJsonBuildMs: ur.unreadRpcJsonBuildMs ?? null,
        unreadRpcRowsFetched: ur.unreadRpcRowsFetched ?? null,
        unreadRpcPayloadBytesEstimate: ur.unreadRpcPayloadBytesEstimate ?? null,
        unreadRpcNetworkOverheadMs: ur.unreadRpcNetworkOverheadMs ?? null,
        unreadRoomIdsCount: ur.unreadRoomIdsCount ?? null,
        unreadProductChatIdsCount: ur.unreadProductChatIdsCount ?? null,
        unreadRowsFetched: ur.unreadRowsFetched ?? null,
        unreadMaxSingleQueryMs: ur.unreadMaxSingleQueryMs ?? null,
        unreadSlowestQuery: ur.unreadSlowestQuery ?? null,
        unreadPayloadBytesEstimate: ur.unreadPayloadBytesEstimate ?? null,
        participantUnreadMs: ur.participantUnreadMs ?? 0,
        legacyTradeUnreadMs: ur.legacyTradeUnreadMs ?? 0,
        unreadMergeCpuMs: ur.unreadMergeCpuMs ?? null,
        ownerHubBadgeMs: ur.ownerHubBadgeMs ?? 0,
        roomIdDedupeMs: ur.roomIdDedupeMs ?? 0,
        badgeAttachCpuMs: ur.badgeAttachCpuMs ?? 0,
        unreadAttachCpuMs: ur.unreadAttachCpuMs ?? null,
        unreadDuplicateFetchCount,
        unreadCacheHit: ur.unreadCacheHit ?? null,
        topUnreadBottleneck: topUnread && topUnread.ms > 0 ? topUnread : null,
        routeTotalMs: trace.deepSteps.bundleSteps?.routeTotalMs ?? null,
      });

      messengerTraceConsoleDebug("[home-sync-unread-bootstrap]", {
        token: trace.token,
        tier,
        unread_bootstrap_list_room_count: ur.unreadBootstrapListRoomCount ?? null,
        unread_bootstrap_list_duplicate_id_rows: ur.unreadBootstrapListDuplicateIdRows ?? null,
        unread_bootstrap_trade_room_rows: ur.unreadBootstrapTradeRoomRowsBeforeDedupe ?? null,
        unread_bootstrap_duplicate_rooms: ur.unreadBootstrapDuplicateRooms ?? null,
        unread_bootstrap_room_count: ur.unreadBootstrapRoomCount ?? null,
        unread_bootstrap_query_count: ur.unreadBootstrapQueryCount ?? ur.unreadQueryCount ?? null,
        unread_bootstrap_cache_hit: ur.unreadBootstrapCacheHit ?? null,
        unread_bootstrap_cache_miss_reason: ur.unreadBootstrapCacheMissReason ?? null,
        unread_bootstrap_skip_reason: ur.unreadBootstrapSkipReason ?? ur.unreadSkipReason ?? null,
        unread_bootstrap_rows_fetched: ur.unreadRowsFetched ?? null,
        unread_bootstrap_count_query_ms: ur.unreadBootstrapCountQueryMs ?? 0,
        unread_bootstrap_rows_fetch_ms: ur.unreadBootstrapRowsFetchMs ?? 0,
        unread_bootstrap_cpu_merge_ms: ur.unreadBootstrapCpuMergeMs ?? 0,
        unread_bootstrap_parallel_wait_ms: ur.unreadBootstrapParallelWaitMs ?? 0,
        unread_bootstrap_top_bottleneck: ur.unreadBootstrapTopBottleneck ?? null,
        unread_badge_ms: ur.unreadBadgeMs ?? 0,
      });

      if (tier === "critical") {
        const eff = ur.unreadEffectiveRttCount ?? 0;
        const badgeMs = ms(ur.unreadBadgeMs ?? 0);
        const srcMs = ms(ur.unreadSourceFetchMs ?? 0);
        const rpcWall = ms(ur.unreadRpcBundleMs ?? 0);
        if (
          ur.unreadLegacyFetchPath === "rpc_bundle" &&
          rpcWall > 250
        ) {
          messengerTraceConsoleDebug("[home-sync-fail] HS5 rpc bundle tail breakdown", {
            token: trace.token,
            unreadRpcBundleMs: rpcWall,
            unreadRpcTotalMs: ur.unreadRpcTotalMs ?? null,
            unreadRpcChatRoomsMs: ur.unreadRpcChatRoomsMs ?? null,
            unreadRpcProductChatsMs: ur.unreadRpcProductChatsMs ?? null,
            unreadRpcMergeMs: ur.unreadRpcMergeMs ?? null,
            unreadRpcJsonBuildMs: ur.unreadRpcJsonBuildMs ?? null,
            unreadRpcRowsFetched: ur.unreadRpcRowsFetched ?? null,
            unreadRpcPayloadBytesEstimate: ur.unreadRpcPayloadBytesEstimate ?? null,
            unreadRpcNetworkOverheadMs: ur.unreadRpcNetworkOverheadMs ?? null,
            unreadSlowestQuery: ur.unreadSlowestQuery ?? null,
            unreadMaxSingleQueryMs: ms(ur.unreadMaxSingleQueryMs ?? 0),
            routeTotalMs: trace.deepSteps.bundleSteps?.routeTotalMs ?? null,
          });
        }
        if (badgeMs > 250 || srcMs > 250) {
          messengerTraceConsoleDebug("[home-sync-fail] HS5 tail spike detected", {
            token: trace.token,
            unreadSlowestQuery: ur.unreadSlowestQuery ?? null,
            unreadMaxSingleQueryMs: ms(ur.unreadMaxSingleQueryMs ?? 0),
            unreadRoomIdsCount: ur.unreadRoomIdsCount ?? null,
            unreadProductChatIdsCount: ur.unreadProductChatIdsCount ?? null,
            unreadAttachCpuMs: ms(ur.unreadAttachCpuMs ?? 0),
            unreadMergeCpuMs: ms(ur.unreadMergeCpuMs ?? 0),
            unreadPayloadBytesEstimate: ur.unreadPayloadBytesEstimate ?? null,
            unreadBadgeMs: badgeMs,
            unreadSourceFetchMs: srcMs,
            unreadLegacyFetchPath: ur.unreadLegacyFetchPath ?? null,
          });
        }
        if (eff > 1 || unreadDuplicateFetchCount > 0) {
          messengerTraceConsoleDebug("[home-sync-fail] HS5 unread target missed", {
            token: trace.token,
            unreadBadgeMs: badgeMs,
            unreadSourceFetchMs: srcMs,
            unreadEffectiveRttCount: eff,
            unreadDuplicateFetchCount,
          });
        }
      }
    }

    try {
      emitHomeSyncRuntimeProfile({
        trace,
        tier,
        fresh,
        enableInMemoryCache,
        shortTtlHit,
        singleflightJoined: homeSyncSingleflightJoined,
        routeTotalWallMs: performance.now() - t0,
        routeBundleAwaitMs,
        routeDevDiagnosticsMs,
      });
    } catch {
      /* ignore */
    }
  }

  const duplicateWindowCount = recordHomeSyncCompletion(duplicateDedupeKey);

  const breakdownOneLine = homeSyncBreakdownEnabled();
  let homeSyncAnalysisSerializeMs = 0;
  let homeSyncAnalysisPayloadKb = 0;
  if (breakdownOneLine) {
    try {
      let payloadBytes = devPayloadBytes;
      let serializeMs = devPayloadSerializeMs;
      if (!payloadBytes) {
        const tSer = performance.now();
        payloadBytes = JSON.stringify(bundle).length;
        serializeMs = performance.now() - tSer;
      }
      homeSyncAnalysisSerializeMs = serializeMs;
      homeSyncAnalysisPayloadKb = Math.round(payloadBytes / 1024);
      const bs = trace?.deepSteps?.bundleSteps;
      const tradeMeta = trace?.deepSteps?.tradeMetaEnrich;
      const rooms_ms = ms(bs?.roomsFetchMs ?? 0);
      const unread_ms = ms(bs?.unreadBadgeMs ?? 0);
      const profiles_ms = ms(bs?.participantsProfilesMs ?? 0);
      const trade_ms = ms(bs?.tradeMetaEnrichTotalMs ?? tradeMeta?.totalMs ?? 0);
      messengerTraceConsoleDebug("[home-sync-breakdown]", {
        total_ms: ms(performance.now() - t0),
        rooms_ms,
        unread_ms,
        profiles_ms,
        trade_ms,
        serialize_ms: ms(serializeMs),
        payload_kb: Math.round(payloadBytes / 1024),
        duplicate_window_count: duplicateWindowCount,
        short_ttl_hit: shortTtlHit,
        tier,
        fresh,
        routeBundleAwaitMs: ms(routeBundleAwaitMs),
        bundleTotalMs: bs?.bundleTotalMs ?? null,
        listMyChatsWallMs: bs?.listMyChatsWallMs ?? null,
      });
    } catch {
      /* ignore */
    }
  } else if (tier === "full" && trace && homeSyncFullAnalysisEnabled()) {
    try {
      const tSer = performance.now();
      const pb = JSON.stringify(bundle).length;
      homeSyncAnalysisSerializeMs = performance.now() - tSer;
      homeSyncAnalysisPayloadKb = Math.round(pb / 1024);
    } catch {
      /* ignore */
    }
  }

  if (trace && tier === "critical") {
    try {
      recordHomeSyncCriticalRouteSnapshot(
        auth.userId,
        ms(routeTotalMsVal),
        trace.deepSteps.bundleSteps?.bundleTotalMs != null ? ms(trace.deepSteps.bundleSteps.bundleTotalMs) : null
      );
    } catch {
      /* ignore */
    }
  }

  if (trace && tier === "full" && homeSyncFullAnalysisEnabled()) {
    try {
      logHomeSyncFullAnalysis({
        userId: auth.userId,
        trace,
        routeTotalMs: ms(routeTotalMsVal),
        serializeMs: homeSyncAnalysisSerializeMs,
        payloadKb: homeSyncAnalysisPayloadKb,
      });
    } catch {
      /* ignore */
    }
  }

  if (trace && homeSyncDeepTraceLogEnabled()) {
    try {
      logHomeSyncDeepTrace({
        trace,
        routeTotalMs: routeTotalMsVal,
        routeBundleAwaitMs,
        routeDevDiagnosticsMs,
        devJsonSerializeMs: devPayloadSerializeMs,
        duplicateWindowCount,
        cache: {
          hit: shortTtlHit,
          fresh,
          cacheKey,
          /** in-process 5s TTL (dev·prod 공통, env 로만 비활성) */
          prodCacheEnabled: enableInMemoryCache,
          lookupMs: homeSyncCacheLookupMs,
          storeMs: homeSyncCacheStoreMs,
          ttlMs: COMMUNITY_MESSENGER_HOME_SYNC_TTL_MS,
          approximateAgeMs: homeSyncCacheApproxAgeMs,
          staleWhileRevalidateServe,
          replayFromProcessCache,
        },
      });
    } catch {
      /* ignore */
    }
  }

  const routeTotalMs = Math.round(performance.now() - t0);
  const roomsCount = (bundle.chats?.length ?? 0) + (bundle.groups?.length ?? 0);
  let payloadKb = 0;
  try {
    payloadKb = Math.round(JSON.stringify(bundle).length / 1024);
  } catch {
    /* ignore */
  }
  const bsLog = trace?.deepSteps?.bundleSteps;
  const criticalMs = shortTtlHit
    ? Math.round(routeTotalMs)
    : ms(bsLog?.listMyChatsWallMs ?? bsLog?.bundleTotalMs ?? routeBundleAwaitMs);
  const deferredMs = ms(bsLog?.tradeMetaEnrichTotalMs ?? 0);
  const tradeMetaDeferred = Boolean(bsLog?.tradeMetaDeferred);
  const unreadCacheHit =
    trace?.deepSteps?.unreadHomeSyncSteps?.unreadCacheHit === true ||
    trace?.deepSteps?.unreadHomeSyncSteps?.unreadBootstrapCacheHit === 1
      ? 1
      : 0;
  const roomsCacheHit = bsLog?.homeSyncCriticalRoomsCacheHit === 1 ? 1 : 0;
  const routeCacheDisabledEnv = process.env.SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE === "1";
  const perfPayload = {
    tier,
    log_kind: shortTtlHit ? ("cache_hit" as const) : ("critical" as const),
    cache_hit: shortTtlHit ? 1 : 0,
    route_cache_enabled: enableInMemoryCache ? 1 : 0,
    short_ttl_hit: shortTtlHit,
    stale_while_revalidate_serve: staleWhileRevalidateServe,
    replay_from_process_cache: replayFromProcessCache,
    cache_age_ms: homeSyncCacheApproxAgeMs != null ? Math.round(homeSyncCacheApproxAgeMs) : 0,
    cache_store_ms: Math.round(homeSyncCacheStoreMs),
    critical_ms: criticalMs,
    deferred_ms: deferredMs,
    trade_meta_deferred: tradeMetaDeferred,
    trade_meta_blocking_ms: deferredMs,
    payload_kb: payloadKb,
    rooms_count: roomsCount,
    route_bundle_await_ms: ms(routeBundleAwaitMs),
    rooms_fetch_ms: ms(bsLog?.roomsFetchMs ?? 0),
    rooms_base_query_ms: ms(bsLog?.roomsBaseQueryMs ?? bsLog?.roomsRound2RoomsDbFetchMs ?? 0),
    participants_join_query_ms: ms(bsLog?.participantsJoinQueryMs ?? 0),
    room_ids_resolution_ms: ms(bsLog?.roomIdsResolutionMs ?? 0),
    room_meta_query_ms: ms(bsLog?.roomMetaQueryMs ?? 0),
    unread_badge_ms: ms(bsLog?.unreadBadgeMs ?? 0),
    last_message_ms: ms(bsLog?.roomsRound2RoomsDbFetchMs ?? 0),
    last_message_from_room_row: 1,
    rooms_cache_hit: roomsCacheHit,
    unread_cache_hit: unreadCacheHit,
    route_cache_disabled_env: routeCacheDisabledEnv,
    route_total_ms: routeTotalMs,
  };
  if (tier === "critical" && trace) {
    let heapUsedMb: number | null = null;
    let rssMb: number | null = null;
    try {
      const mu = process.memoryUsage();
      heapUsedMb = Math.round(mu.heapUsed / 1024 / 1024);
      rssMb = Math.round(mu.rss / 1024 / 1024);
    } catch {
      /* ignore */
    }
    console.log("[home-sync-hs5-after]", {
      total_ms: routeTotalMs,
      rooms_fetch_ms: ms(bsLog?.roomsFetchMs ?? 0),
      unread_ms: ms(bsLog?.unreadBadgeMs ?? 0),
      last_message_ms: ms(bsLog?.roomsRound2RoomsDbFetchMs ?? 0),
      route_bundle_await_ms: ms(routeBundleAwaitMs),
      rooms_cache_hit: roomsCacheHit,
      unread_cache_hit: unreadCacheHit,
      room_count: roomsCount,
      payload_kb: payloadKb,
      heap_used_mb: heapUsedMb,
      rss_mb: rssMb,
      route_cache_disabled_env: routeCacheDisabledEnv,
    });
  }
  /** `home-sync` 로 검색하면 항상 1줄 — cache miss·hit 구분은 `log_kind` */
  console.log("[home-sync-perf]", perfPayload);
  logPerfMeasurementContext({
    route: "/api/community-messenger/home-sync",
    server_handler_ms: routeTotalMs,
    extras: { ...perfPayload, log_channel: "home-sync-perf" },
  });
  if (shortTtlHit) {
    console.log("[home-sync-cache-hit]", perfPayload);
  } else {
    console.log("[home-sync-critical]", perfPayload);
    if (tradeMetaDeferred) {
      console.log("[home-sync-deferred]", {
        tier,
        trade_meta_deferred: true,
        critical_ms: criticalMs,
        rooms_count: roomsCount,
      });
    }
  }

  recordMessengerApiTiming("GET /api/community-messenger/home-sync", routeTotalMs, 200);
  const perfHeaders: Record<string, string> = {
    "x-samarket-home-sync-log-kind": perfPayload.log_kind,
    "x-samarket-home-sync-critical-ms": String(criticalMs),
    "x-samarket-home-sync-trade-meta-deferred": tradeMetaDeferred ? "1" : "0",
    "x-samarket-home-sync-cache-hit": shortTtlHit ? "1" : "0",
  };
  const homeSyncSignoffObs: SnapshotSignoffObs =
    shortTtlHit && tier === "critical"
      ? homeSyncRouteMemoryTtlObs()
      : tier === "critical"
        ? (peekLastHomeSyncRouteObservability() ?? {
            snapshotPath: false,
            queryWave2Ms: 0,
            rpcRemoved: 0,
            fallbackUsed: 1,
          })
        : {
            snapshotPath: false,
            queryWave2Ms: 0,
            rpcRemoved: 0,
            fallbackUsed: 0,
          };
  // Gate 는 bundle(payload) cache 와 분리 — 응답 직전 최신 resolver 결과를 overlay 한다.
  // bundle 객체를 변형하지 않고 새 envelope 로만 합류시킨다(캐시 오염 방지).
  const cutoverGate = await resolveCmHomeCutoverGateRuntimeMeta(auth.userId);
  return jsonOkWithRequest(
    req,
    { ...bundle, runtimeMeta: { [CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY]: cutoverGate } },
    {
      headers: {
        ...messengerApiEdgeCacheHeaders(),
        ...perfHeaders,
        ...buildSnapshotSignoffHeaders("home-sync", homeSyncSignoffObs),
      },
    }
  );
}
