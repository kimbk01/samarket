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
import { homeSyncBreakdownEnabled } from "@/lib/community-messenger/home-sync-breakdown-log";
import {
  homeSyncRequestDedupeKey,
  recordHomeSyncCompletion,
} from "@/lib/community-messenger/home-sync-duplicate-window";
import {
  buildHomeSyncOutsideTradeStepBreakdown,
  buildHomeSyncTradeMetaStepBreakdown,
  ms,
  type HomeSyncTrace,
} from "@/lib/community-messenger/home-sync-trace";
import { recordHomeSyncCriticalRouteSnapshot } from "@/lib/community-messenger/home-sync-critical-route-snapshot";
import {
  homeSyncFullAnalysisEnabled,
  logHomeSyncFullAnalysis,
} from "@/lib/community-messenger/home-sync-full-analysis-log";

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

  const tPostRateLimit = performance.now();

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const tierParam = req.nextUrl.searchParams.get("tier");
  const tier: "critical" | "full" = tierParam === "critical" ? "critical" : "full";
  const now = Date.now();
  /**
   * critical tier 에서는 **항상** trace 객체를 만들어 `tier` 마커를 service 단까지 전파한다.
   * - dev: 기존처럼 token 도 채워 deepSteps 로그 활성.
   * - prod: token 은 빈 문자열 → 기존 `trace?.token` 분기는 모두 비활성.
   *   `tier === "critical"` 마커만 살아 있어 posts fallback probing 차단(HS2).
   * - dev + full tier: bundleSteps·unread 세분을 위해 token 을 켠다(프로덕션 full 은 trace 없음 유지).
   */
  const trace: HomeSyncTrace | undefined =
    tier === "critical"
      ? {
          token: isDev
            ? `home-sync:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
            : "",
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
  /** 프로덕션 5s in-memory 캐시 히트 — 개발에서는 캐시 비활성이라 항상 false */
  const shortTtlHit = Boolean(bundle);

  const tBeforeBundleResolution = performance.now();
  let routeBundleAwaitMs = 0;
  let routeDevDiagnosticsMs = 0;
  /** dev: `[home-sync-breakdown]` 에서 재사용해 이중 JSON.stringify 방지 */
  let devPayloadBytes = 0;
  let devPayloadSerializeMs = 0;
  if (trace) {
    trace.deepSteps.bundleSteps = {
      ...(trace.deepSteps.bundleSteps ?? {}),
      routePreBundleMs: ms(tBeforeBundleResolution - tPostRateLimit),
    };
  }

  if (!bundle) {
    try {
      const tAwaitStart = performance.now();
      bundle = await getCommunityMessengerHomeSyncBundle(auth.userId, tier, { trace });
      routeBundleAwaitMs = performance.now() - tAwaitStart;
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
      const tDiag = performance.now();
      const rooms = (bundle.chats?.length ?? 0) + (bundle.groups?.length ?? 0);
      const friends = bundle.friends?.length ?? 0;
      const requests = bundle.requests?.length ?? 0;

      // [home-sync-size] JSON length (KB)
      const tJson = performance.now();
      devPayloadBytes = JSON.stringify(bundle).length;
      devPayloadSerializeMs = performance.now() - tJson;
      console.warn("[home-sync-size]", {
        payloadKB: Math.round(devPayloadBytes / 1024),
        rooms,
        friends,
        requests,
        jsonStringifyMs: Math.round(devPayloadSerializeMs),
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
      routeDevDiagnosticsMs = performance.now() - tDiag;
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
      console.warn("[home-sync-deep-steps]", {
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
    console.warn("[home-sync-bundle-steps]", {
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
    });

    const tradeMeta = trace.deepSteps.tradeMetaEnrich;
    if (tradeMeta) {
      const tm = buildHomeSyncTradeMetaStepBreakdown(tradeMeta, trace.deepSteps.tradeMetaBuildFromPostDetail);
      const tpfd = trace.deepSteps.tradePostsFetchDetail;
      const split = trace.deepSteps.tradePostsResolvedSplit;
      const lightDenom = split?.lightFetchPostIdsTotal ?? 0;
      const imagesPatchPostIdRatio =
        lightDenom > 0 ? Math.round(((split?.patchPostIdsTotal ?? 0) / lightDenom) * 1000) / 1000 : null;
      console.warn("[home-sync-trade-meta-steps]", {
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
    console.warn("[home-sync-outside-trade-steps]", {
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
      console.warn("[home-sync-unread-steps]", {
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

      if (tier === "critical") {
        const eff = ur.unreadEffectiveRttCount ?? 0;
        const badgeMs = ms(ur.unreadBadgeMs ?? 0);
        const srcMs = ms(ur.unreadSourceFetchMs ?? 0);
        const rpcWall = ms(ur.unreadRpcBundleMs ?? 0);
        if (
          ur.unreadLegacyFetchPath === "rpc_bundle" &&
          rpcWall > 250
        ) {
          console.warn("[home-sync-fail] HS5 rpc bundle tail breakdown", {
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
          console.warn("[home-sync-fail] HS5 tail spike detected", {
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
          console.warn("[home-sync-fail] HS5 unread target missed", {
            token: trace.token,
            unreadBadgeMs: badgeMs,
            unreadSourceFetchMs: srcMs,
            unreadEffectiveRttCount: eff,
            unreadDuplicateFetchCount,
          });
        }
      }
    }
  }

  const breakdownOneLine = isDev || homeSyncBreakdownEnabled();
  let homeSyncAnalysisSerializeMs = 0;
  let homeSyncAnalysisPayloadKb = 0;
  if (breakdownOneLine) {
    try {
      let payloadBytes = devPayloadBytes;
      let serializeMs = devPayloadSerializeMs;
      if (!isDev) {
        const tSer = performance.now();
        payloadBytes = JSON.stringify(bundle).length;
        serializeMs = performance.now() - tSer;
      }
      homeSyncAnalysisSerializeMs = serializeMs;
      homeSyncAnalysisPayloadKb = Math.round(payloadBytes / 1024);
      const duplicateDedupeKey = `${auth.userId}|${homeSyncRequestDedupeKey(req.nextUrl.pathname, req.nextUrl.searchParams)}`;
      const duplicate_window_count = recordHomeSyncCompletion(duplicateDedupeKey);
      const bs = trace?.deepSteps?.bundleSteps;
      const tradeMeta = trace?.deepSteps?.tradeMetaEnrich;
      const rooms_ms = ms(bs?.roomsFetchMs ?? 0);
      const unread_ms = ms(bs?.unreadBadgeMs ?? 0);
      const profiles_ms = ms(bs?.participantsProfilesMs ?? 0);
      const trade_ms = ms(bs?.tradeMetaEnrichTotalMs ?? tradeMeta?.totalMs ?? 0);
      console.info("[home-sync-breakdown]", {
        total_ms: ms(performance.now() - t0),
        rooms_ms,
        unread_ms,
        profiles_ms,
        trade_ms,
        serialize_ms: ms(serializeMs),
        payload_kb: Math.round(payloadBytes / 1024),
        duplicate_window_count,
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

  recordMessengerApiTiming("GET /api/community-messenger/home-sync", Math.round(performance.now() - t0), 200);
  return jsonOkWithRequest(req, bundle, { headers: messengerApiEdgeCacheHeaders() });
}
