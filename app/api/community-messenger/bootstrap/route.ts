import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  getCommunityMessengerBootstrap,
  getCommunityMessengerBootstrapCritical,
  listCommunityMessengerCallLogs,
  type CommunityMessengerBootstrapDiagnostics,
} from "@/lib/community-messenger/service";
import {
  recordMessengerApiTiming,
  recordMessengerBootstrapBreakdown,
} from "@/lib/community-messenger/monitoring/server-store";
import type { MessengerBootstrapBreakdown } from "@/lib/community-messenger/monitoring/types";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";

/** 1단계: `[cm-bootstrap-v2]` — 동작 변경 없이 관측만 (critical tier 분리 전) */
function logCmBootstrapV2(params: {
  diagnostics: CommunityMessengerBootstrapDiagnostics;
  authMs: number;
  routeTotalMs: number;
  serializationMs: number;
  payloadUtf8Bytes: number;
  /** 라우트에서 `getCommunityMessengerBootstrap` 대기 구간(ms); critical 분리 전엔 곧 full monolith */
  fullPayloadMs: number;
}) {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  const d = params.diagnostics;
  const friendsQueryMs = d.parallelAcceptedFriendsBundleMs + d.parallelFavoriteFriendsMs;
  const dbRoundTrips =
    d.roomsPayloadDbRoundTrips +
    6 +
    (d.callsLogRowsFetchMs > 0 ? 2 : 0) +
    1 +
    (d.parallelMeetingsForDiscoverableMs > 0 ? 1 : 0) +
    (d.parallelDiscoverableFetchMs > 0 ? 4 : 0);
  const criticalPayloadMs = 0;
  const tradeEnrichMs = d.tradeContextMs;
  const stageEntries: Array<[string, number]> = [
    ["auth_ms", params.authMs],
    ["critical_payload_ms", criticalPayloadMs],
    ["full_payload_ms", params.fullPayloadMs],
    ["parallel_initial_wall_ms", d.parallelInitialWallMs],
    ["rooms_query_ms", d.roomsQueryMs],
    ["participants_query_ms", d.roomsQueryRound2ParticipantsMs],
    ["profiles_query_ms", d.profilesMs],
    ["unread_query_ms", d.unreadMs],
    ["friends_query_ms", friendsQueryMs],
    ["requests_query_ms", d.parallelFriendRequestsMs],
    ["trade_enrich_ms", tradeEnrichMs],
    ["serialization_ms", params.serializationMs],
  ];
  let worstStage = "";
  let worstMs = -1;
  for (const [name, ms] of stageEntries) {
    if (ms > worstMs) {
      worstMs = ms;
      worstStage = name;
    }
  }
  // eslint-disable-next-line no-console -- gated messenger trace
  console.debug(
    "[cm-bootstrap-v2]",
    JSON.stringify({
      total_api_ms: params.routeTotalMs,
      auth_ms: params.authMs,
      critical_payload_ms: criticalPayloadMs,
      full_payload_ms: params.fullPayloadMs,
      parallel_initial_wall_ms: d.parallelInitialWallMs,
      rooms_query_ms: d.roomsQueryMs,
      participants_query_ms: d.roomsQueryRound2ParticipantsMs,
      profiles_query_ms: d.profilesMs,
      unread_query_ms: d.unreadMs,
      friends_query_ms: friendsQueryMs,
      requests_query_ms: d.parallelFriendRequestsMs,
      trade_enrich_ms: tradeEnrichMs,
      serialization_ms: params.serializationMs,
      payload_kb: Math.round((params.payloadUtf8Bytes / 1024) * 1000) / 1000,
      db_round_trips: dbRoundTrips,
      room_count: d.roomCount,
      worst_stage: worstStage,
      worst_stage_ms: worstMs,
    })
  );
}

/** `tier=critical` — 리스트 첫 페인트 전용; trade 목록 enrich·친구 묶음 없음 */
function logCmBootstrapV2Critical(params: {
  diagnostics: import("@/lib/community-messenger/bootstrap/critical-stage").CommunityMessengerCriticalTierDiagnostics;
  authMs: number;
  routeTotalMs: number;
  serializationMs: number;
  payloadUtf8Bytes: number;
  criticalPayloadMs: number;
  dbRoundTrips: number;
  roomCount: number;
}) {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  const d = params.diagnostics;
  const stageEntries: Array<[string, number]> = [
    ["auth_ms", params.authMs],
    ["critical_payload_ms", params.criticalPayloadMs],
    ["full_payload_ms", 0],
    ["parallel_initial_wall_ms", 0],
    ["rooms_query_ms", d.roomsQueryMs],
    ["participants_query_ms", d.participantsQueryMs],
    ["profiles_query_ms", d.profilesMs],
    ["unread_query_ms", d.unreadMs],
    ["critical_cpu_merge_ms", d.criticalCpuMergeMs],
    ["friends_query_ms", 0],
    ["requests_query_ms", 0],
    ["trade_enrich_ms", 0],
    ["serialization_ms", params.serializationMs],
  ];
  let worstStage = "";
  let worstMs = -1;
  for (const [name, ms] of stageEntries) {
    if (ms > worstMs) {
      worstMs = ms;
      worstStage = name;
    }
  }
  const payloadKb = Math.round((params.payloadUtf8Bytes / 1024) * 1000) / 1000;
  // eslint-disable-next-line no-console -- gated messenger trace
  console.debug(
    "[cm-bootstrap-v2]",
    JSON.stringify({
      total_api_ms: params.routeTotalMs,
      auth_ms: params.authMs,
      critical_payload_ms: params.criticalPayloadMs,
      full_payload_ms: 0,
      parallel_initial_wall_ms: 0,
      rooms_query_ms: d.roomsQueryMs,
      participants_query_ms: d.participantsQueryMs,
      profiles_query_ms: d.profilesMs,
      unread_query_ms: d.unreadMs,
      friends_query_ms: 0,
      requests_query_ms: 0,
      trade_enrich_ms: 0,
      serialization_ms: params.serializationMs,
      payload_kb: payloadKb,
      critical_rooms_query_ms: d.roomsQueryMs,
      critical_participants_ms: d.participantsQueryMs,
      critical_profiles_ms: d.profilesMs,
      critical_unread_ms: d.unreadMs,
      critical_cpu_merge_ms: d.criticalCpuMergeMs,
      critical_payload_kb: payloadKb,
      critical_skipped_room_profiles: d.criticalSkippedRoomProfiles,
      critical_reused_payload_by_room_id: d.criticalReusedPayloadByRoomId,
      db_round_trips: params.dbRoundTrips,
      room_count: params.roomCount,
      worst_stage: worstStage,
      worst_stage_ms: worstMs,
    })
  );
}

function logCmBootstrapBreakdown(params: {
  diagnostics: CommunityMessengerBootstrapDiagnostics;
  authMs: number;
  routeTotalMs: number;
  serializationMs: number;
  jsonResponseMs: number;
  payloadUtf8Bytes: number;
  cacheHit: boolean;
  mode: MessengerBootstrapBreakdown["mode"];
}) {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  const d = params.diagnostics;
  const timingsValid = !params.cacheHit;
  const messagesQueryMs = 0;
  const enrichPresenceMs = 0;
  const friendsQueryMs = d.parallelAcceptedFriendsBundleMs + d.parallelFavoriteFriendsMs;
  const dbRoundTripsEstimate =
    d.roomsPayloadDbRoundTrips +
    6 +
    (d.callsLogRowsFetchMs > 0 ? 2 : 0) +
    1 +
    (d.parallelMeetingsForDiscoverableMs > 0 ? 1 : 0) +
    (d.parallelDiscoverableFetchMs > 0 ? 4 : 0);

  const stageEntries: Array<[string, number]> = [
    ["auth_ms", params.authMs],
    ["parallel_initial_wall_ms", d.parallelInitialWallMs],
    ["rooms_query_ms", d.roomsQueryMs],
    ["messages_query_ms", messagesQueryMs],
    ["participants_query_ms", d.roomsQueryRound2ParticipantsMs],
    ["profiles_query_ms", d.profilesMs],
    ["unread_query_ms", d.unreadMs],
    ["requests_query_ms", d.parallelFriendRequestsMs],
    ["friends_query_ms", friendsQueryMs],
    ["enrich_trade_ms", d.tradeContextMs],
    ["enrich_presence_ms", enrichPresenceMs],
    ["serialization_ms", params.serializationMs],
    ["json_response_ms", params.jsonResponseMs],
  ];
  let worstStage = "";
  let worstMs = -1;
  for (const [name, ms] of stageEntries) {
    if (ms > worstMs) {
      worstMs = ms;
      worstStage = name;
    }
  }

  // eslint-disable-next-line no-console -- gated messenger trace
  console.debug(
    "[cm-bootstrap-breakdown]",
    JSON.stringify({
      total_api_ms: params.routeTotalMs,
      auth_ms: params.authMs,
      rooms_query_ms: d.roomsQueryMs,
      messages_query_ms: messagesQueryMs,
      participants_query_ms: d.roomsQueryRound2ParticipantsMs,
      profiles_query_ms: d.profilesMs,
      unread_query_ms: d.unreadMs,
      requests_query_ms: d.parallelFriendRequestsMs,
      friends_query_ms: friendsQueryMs,
      enrich_trade_ms: d.tradeContextMs,
      enrich_presence_ms: enrichPresenceMs,
      serialization_ms: params.serializationMs,
      json_response_ms: params.jsonResponseMs,
      room_count: d.roomCount,
      participant_count: d.participantCount,
      message_count: 0,
      payload_kb: Math.round((params.payloadUtf8Bytes / 1024) * 1000) / 1000,
      db_round_trips_estimate: dbRoundTripsEstimate,
      rooms_payload_db_round_trips: d.roomsPayloadDbRoundTrips,
      parallel_initial_wall_ms: d.parallelInitialWallMs,
      parallel_accepted_friends_ms: d.parallelAcceptedFriendsBundleMs,
      parallel_favorite_ms: d.parallelFavoriteFriendsMs,
      parallel_discoverable_ms: d.parallelDiscoverableFetchMs,
      parallel_meetings_ms: d.parallelMeetingsForDiscoverableMs,
      calls_log_rows_fetch_ms: d.callsLogRowsFetchMs,
      enrich_trade_direct_keys_ms: d.enrichTradeDirectKeysMs,
      enrich_trade_middle_ms: d.enrichTradeMiddlePipelineMs,
      enrich_trade_seller_ms: d.enrichTradeSellerHydrateMs,
      worst_stage: worstStage,
      worst_stage_ms: worstMs,
      timings_valid: timingsValid,
      cache_hit: params.cacheHit,
      mode: params.mode,
      note: timingsValid ? undefined : "per-stage timings require cache miss or ?fresh=1",
    })
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS = 8_000;
/** `userId:lite|full` 키가 늘어나도 프로세스 메모리가 비한정으로 커지지 않게 상한(만료 + FIFO) */
const COMMUNITY_MESSENGER_BOOTSTRAP_CACHE_MAX_ENTRIES = 500;

type CommunityMessengerBootstrapCacheEntry = {
  payload: Awaited<ReturnType<typeof getCommunityMessengerBootstrap>>;
  expiresAt: number;
};

const communityMessengerBootstrapCache = new Map<string, CommunityMessengerBootstrapCacheEntry>();
const communityMessengerBootstrapInflight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof getCommunityMessengerBootstrap>>>
>();

export async function GET(request: NextRequest) {
  const t0 = performance.now();
  const tAuth = performance.now();
  const bootstrapDiag = request.nextUrl.searchParams.get("bootstrap_diag") === "1";
  const auth = await requireAuthenticatedUserId();
  const authMs = Math.round(performance.now() - tAuth);
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

  if (request.nextUrl.searchParams.get("tier") === "critical") {
    const critical = await getCommunityMessengerBootstrapCritical(auth.userId);
    const routeTotalMsCritical = Math.round(performance.now() - t0);
    recordMessengerApiTiming(
      "GET /api/community-messenger/bootstrap?tier=critical",
      routeTotalMsCritical,
      200
    );

    const jsonBodyCritical = { ok: true as const, ...critical.payload };
    const tSerCritical = performance.now();
    const serializedCritical = JSON.stringify(jsonBodyCritical);
    const serializationMsCritical = Math.round(performance.now() - tSerCritical);
    const payloadUtf8BytesCritical = Buffer.byteLength(serializedCritical, "utf8");
    const payloadKbCritical = Math.round((payloadUtf8BytesCritical / 1024) * 1000) / 1000;

    logCmBootstrapV2Critical({
      diagnostics: critical.tierDiagnostics,
      authMs,
      routeTotalMs: routeTotalMsCritical,
      serializationMs: serializationMsCritical,
      payloadUtf8Bytes: payloadUtf8BytesCritical,
      criticalPayloadMs: critical.criticalPayloadMs,
      dbRoundTrips: critical.dbRoundTrips,
      roomCount: critical.roomCount,
    });

    if (
      messengerVerboseTraceConsoleEnabled() &&
      (payloadKbCritical > 150 || critical.dbRoundTrips > 8)
    ) {
      // eslint-disable-next-line no-console -- gated threshold diagnostic
      console.debug(
        "[cm-bootstrap-v2-warning]",
        JSON.stringify({
          tier: "critical",
          payload_kb: payloadKbCritical,
          db_round_trips: critical.dbRoundTrips,
          limits: { payload_kb_max: 150, db_round_trips_max: 8 },
        })
      );
    }

    return new NextResponse(serializedCritical, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        /** 클라이언트 `critical-bootstrap-client` 관측 — 동작·페이로드 불변 */
        "x-samarket-critical-payload-kb": String(payloadKbCritical),
        "x-samarket-critical-route-ms": String(routeTotalMsCritical),
        "x-samarket-critical-serialization-ms": String(serializationMsCritical),
        "x-samarket-critical-room-count": String(critical.roomCount),
      },
    });
  }

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const lite = request.nextUrl.searchParams.get("lite") === "1";
  const mode: MessengerBootstrapBreakdown["mode"] = fresh ? "fresh" : lite ? "lite" : "full";
  const cacheKey = `${auth.userId}:${lite ? "lite" : "full"}`;
  const inflightKey = `${cacheKey}:${fresh ? "fresh" : "cached"}`;
  const now = Date.now();
  pruneByExpiresAtAndMaxSize(communityMessengerBootstrapCache, now, COMMUNITY_MESSENGER_BOOTSTRAP_CACHE_MAX_ENTRIES);

  let data = communityMessengerBootstrapCache.get(cacheKey)?.payload;
  const diagnostics: CommunityMessengerBootstrapDiagnostics = {
    parallelInitialWallMs: 0,
    roomsQueryMs: 0,
    roomsQueryRound1Ms: 0,
    roomsQueryRound2Ms: 0,
    roomsQueryRound2RoomsMs: 0,
    roomsQueryRound2RoomsDbFetchMs: 0,
    roomsQueryRound2RoomsNormalizeMs: 0,
    roomsQueryRound2RoomsMergeMapMs: 0,
    roomsQueryRound2RoomsHydrateLabelMs: 0,
    roomsQueryRound2RoomsPayloadSerializeMs: 0,
    roomsQueryRound2ParticipantsMs: 0,
    roomsQueryRound3Ms: 0,
    roomsQueryTransformMs: 0,
    roomsQueryPostprocessMs: 0,
    unreadMs: 0,
    profilesMs: 0,
    tradeContextMs: 0,
    callsLogMs: 0,
    transformMs: 0,
    roomCount: 0,
    participantCount: 0,
    roomsQueryRound1RoomIdCount: 0,
    roomsQueryRound2RoomRowCount: 0,
    roomsQueryRound2ParticipantRowCount: 0,
    roomsQueryRound3RoomProfileCount: 0,
    unreadAggregation: "community_messenger_participants.unread_count + trade legacy unread batch max merge",
    roomsQueryRounds: 0,
    additionalLookupRounds: 0,
    extraRoomsFetchRounds: 0,
    hasPerRoomNPlusOne: false,
    callsLogIncluded: !lite,
    discoverableIncluded: !lite,
    roomsPayloadDbRoundTrips: 0,
    parallelAcceptedFriendsBundleMs: 0,
    parallelFavoriteFriendsMs: 0,
    parallelFollowingNeighborMs: 0,
    parallelFollowingHiddenMs: 0,
    parallelFollowingBlockedMs: 0,
    parallelFriendRequestsMs: 0,
    parallelDiscoverableFetchMs: 0,
    callsLogRowsFetchMs: 0,
    parallelMeetingsForDiscoverableMs: 0,
    enrichTradeDirectKeysMs: 0,
    enrichTradeSellerHydrateMs: 0,
    enrichTradeMiddlePipelineMs: 0,
    bootstrapMonolithWallMs: 0,
  };
  const cacheHit = Boolean(data) && !fresh;
  let fullPayloadAwaitMs = 0;
  if (!data || fresh) {
    const tFullPayload = performance.now();
    const existingInflight = bootstrapDiag ? null : communityMessengerBootstrapInflight.get(inflightKey);
    if (existingInflight) {
      data = await existingInflight;
    } else {
      const loadPromise = getCommunityMessengerBootstrap(auth.userId, {
        skipDiscoverable: lite,
        deferCallLog: lite,
        diagnostics,
        detailedTimingBreakdown: bootstrapDiag,
      });
      if (!bootstrapDiag) {
        communityMessengerBootstrapInflight.set(inflightKey, loadPromise);
      }
      try {
        data = await loadPromise;
      } finally {
        communityMessengerBootstrapInflight.delete(inflightKey);
      }
    }
    fullPayloadAwaitMs = Math.round(performance.now() - tFullPayload);
    const afterFetch = Date.now();
    communityMessengerBootstrapCache.set(cacheKey, {
      payload: data,
      expiresAt: afterFetch + COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS,
    });
    pruneByExpiresAtAndMaxSize(communityMessengerBootstrapCache, afterFetch, COMMUNITY_MESSENGER_BOOTSTRAP_CACHE_MAX_ENTRIES);
  }
  const routeDurationMs = Math.round(performance.now() - t0);
  recordMessengerApiTiming("GET /api/community-messenger/bootstrap", routeDurationMs, 200);
  const breakdown = {
    capturedAt: new Date().toISOString(),
    mode,
    cacheHit,
    callsLogIncluded: diagnostics.callsLogIncluded,
    discoverableIncluded: diagnostics.discoverableIncluded,
    routeTotalMs: Math.round(performance.now() - t0),
    authMs,
    parallelInitialWallMs: diagnostics.parallelInitialWallMs,
    roomsQueryMs: diagnostics.roomsQueryMs,
    roomsQueryRound1Ms: diagnostics.roomsQueryRound1Ms,
    roomsQueryRound2Ms: diagnostics.roomsQueryRound2Ms,
    roomsQueryRound2RoomsMs: diagnostics.roomsQueryRound2RoomsMs,
    roomsQueryRound2RoomsDbFetchMs: diagnostics.roomsQueryRound2RoomsDbFetchMs,
    roomsQueryRound2RoomsNormalizeMs: diagnostics.roomsQueryRound2RoomsNormalizeMs,
    roomsQueryRound2RoomsMergeMapMs: diagnostics.roomsQueryRound2RoomsMergeMapMs,
    roomsQueryRound2RoomsHydrateLabelMs: diagnostics.roomsQueryRound2RoomsHydrateLabelMs,
    roomsQueryRound2RoomsPayloadSerializeMs: diagnostics.roomsQueryRound2RoomsPayloadSerializeMs,
    roomsQueryRound2ParticipantsMs: diagnostics.roomsQueryRound2ParticipantsMs,
    roomsQueryRound3Ms: diagnostics.roomsQueryRound3Ms,
    roomsQueryTransformMs: diagnostics.roomsQueryTransformMs,
    roomsQueryPostprocessMs: diagnostics.roomsQueryPostprocessMs,
    unreadMs: diagnostics.unreadMs,
    profilesMs: diagnostics.profilesMs,
    tradeContextMs: diagnostics.tradeContextMs,
    callsLogMs: diagnostics.callsLogMs,
    transformMs: diagnostics.transformMs,
    responseJsonMs: 0,
    roomCount: diagnostics.roomCount,
    participantCount: diagnostics.participantCount,
    roomsQueryRound1RoomIdCount: diagnostics.roomsQueryRound1RoomIdCount,
    roomsQueryRound2RoomRowCount: diagnostics.roomsQueryRound2RoomRowCount,
    roomsQueryRound2ParticipantRowCount: diagnostics.roomsQueryRound2ParticipantRowCount,
    roomsQueryRound3RoomProfileCount: diagnostics.roomsQueryRound3RoomProfileCount,
    unreadAggregation: diagnostics.unreadAggregation,
    roomsQueryRounds: diagnostics.roomsQueryRounds,
    additionalLookupRounds: diagnostics.additionalLookupRounds,
    extraRoomsFetchRounds: diagnostics.extraRoomsFetchRounds,
    hasPerRoomNPlusOne: diagnostics.hasPerRoomNPlusOne,
  };
  if (bootstrapDiag) {
    const diagBody = {
      ok: true as const,
      bootstrap_diag: {
        messenger_bootstrap_route_total_ms: breakdown.routeTotalMs,
        messenger_bootstrap_auth_ms: breakdown.authMs,
        messenger_bootstrap_parallel_initial_wall_ms: breakdown.parallelInitialWallMs,
        messenger_bootstrap_rooms_query_ms: breakdown.roomsQueryMs,
        rooms_query_round_1_ms: breakdown.roomsQueryRound1Ms,
        rooms_query_round_2_ms: breakdown.roomsQueryRound2Ms,
        rooms_query_round_2_wall_ms: breakdown.roomsQueryRound2Ms,
        rooms_query_round_2_rooms_ms: breakdown.roomsQueryRound2RoomsMs,
        rooms_query_round_2_rooms_db_fetch_ms: breakdown.roomsQueryRound2RoomsDbFetchMs,
        rooms_query_round_2_rooms_normalize_ms: breakdown.roomsQueryRound2RoomsNormalizeMs,
        rooms_query_round_2_rooms_merge_map_ms: breakdown.roomsQueryRound2RoomsMergeMapMs,
        rooms_query_round_2_rooms_hydrate_label_ms: breakdown.roomsQueryRound2RoomsHydrateLabelMs,
        rooms_query_round_2_rooms_payload_serialize_ms: breakdown.roomsQueryRound2RoomsPayloadSerializeMs,
        rooms_query_round_2_participants_ms: breakdown.roomsQueryRound2ParticipantsMs,
        rooms_query_round_3_ms: breakdown.roomsQueryRound3Ms,
        rooms_query_transform_ms: breakdown.roomsQueryTransformMs,
        rooms_query_postprocess_ms: breakdown.roomsQueryPostprocessMs,
        messenger_bootstrap_profiles_ms: breakdown.profilesMs,
        messenger_bootstrap_unread_ms: breakdown.unreadMs,
        messenger_bootstrap_trade_context_ms: breakdown.tradeContextMs,
        messenger_bootstrap_calls_log_ms: breakdown.callsLogMs,
        messenger_bootstrap_transform_ms: breakdown.transformMs,
        messenger_bootstrap_response_json_ms: 0,
        room_row_count: breakdown.roomCount,
        participant_row_count: breakdown.participantCount,
        rooms_query_round_1_room_id_count: breakdown.roomsQueryRound1RoomIdCount,
        rooms_query_round_2_room_row_count: breakdown.roomsQueryRound2RoomRowCount,
        rooms_query_round_2_participant_row_count: breakdown.roomsQueryRound2ParticipantRowCount,
        rooms_query_round_3_room_profile_count: breakdown.roomsQueryRound3RoomProfileCount,
        unread_source: breakdown.unreadAggregation,
        extra_rooms_fetch_rounds: breakdown.extraRoomsFetchRounds,
        rooms_query_rounds: breakdown.roomsQueryRounds,
        additional_lookup_rounds: breakdown.additionalLookupRounds,
        has_per_room_n_plus_one: breakdown.hasPerRoomNPlusOne,
        cache_hit: breakdown.cacheHit,
        mode: breakdown.mode,
        calls_log_included: breakdown.callsLogIncluded,
        discoverable_included: breakdown.discoverableIncluded,
      },
    };
    const tSer = performance.now();
    const diagSerialized = JSON.stringify(diagBody);
    const serializationMs = Math.round(performance.now() - tSer);
    const payloadUtf8Bytes = Buffer.byteLength(diagSerialized, "utf8");
    const tDiagJson = performance.now();
    const diagResponse = new NextResponse(diagSerialized, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    breakdown.responseJsonMs = Math.round(performance.now() - tDiagJson);
    logCmBootstrapV2({
      diagnostics,
      authMs,
      routeTotalMs: breakdown.routeTotalMs,
      serializationMs,
      payloadUtf8Bytes,
      fullPayloadMs: fullPayloadAwaitMs,
    });
    logCmBootstrapBreakdown({
      diagnostics,
      authMs,
      routeTotalMs: breakdown.routeTotalMs,
      serializationMs,
      jsonResponseMs: breakdown.responseJsonMs,
      payloadUtf8Bytes,
      cacheHit,
      mode,
    });
    recordMessengerBootstrapBreakdown({
      capturedAt: breakdown.capturedAt,
      mode: breakdown.mode,
      cacheHit: breakdown.cacheHit,
      callsLogIncluded: breakdown.callsLogIncluded,
      discoverableIncluded: breakdown.discoverableIncluded,
      routeTotalMs: breakdown.routeTotalMs,
      authMs: breakdown.authMs,
      parallelInitialWallMs: breakdown.parallelInitialWallMs,
      roomsQueryMs: breakdown.roomsQueryMs,
      roomsQueryRound1Ms: breakdown.roomsQueryRound1Ms,
      roomsQueryRound2Ms: breakdown.roomsQueryRound2Ms,
      roomsQueryRound2RoomsMs: breakdown.roomsQueryRound2RoomsMs,
      roomsQueryRound2RoomsDbFetchMs: breakdown.roomsQueryRound2RoomsDbFetchMs,
      roomsQueryRound2RoomsNormalizeMs: breakdown.roomsQueryRound2RoomsNormalizeMs,
      roomsQueryRound2RoomsMergeMapMs: breakdown.roomsQueryRound2RoomsMergeMapMs,
      roomsQueryRound2RoomsHydrateLabelMs: breakdown.roomsQueryRound2RoomsHydrateLabelMs,
      roomsQueryRound2RoomsPayloadSerializeMs: breakdown.roomsQueryRound2RoomsPayloadSerializeMs,
      roomsQueryRound2ParticipantsMs: breakdown.roomsQueryRound2ParticipantsMs,
      roomsQueryRound3Ms: breakdown.roomsQueryRound3Ms,
      roomsQueryTransformMs: breakdown.roomsQueryTransformMs,
      roomsQueryPostprocessMs: breakdown.roomsQueryPostprocessMs,
      unreadMs: breakdown.unreadMs,
      profilesMs: breakdown.profilesMs,
      tradeContextMs: breakdown.tradeContextMs,
      callsLogMs: breakdown.callsLogMs,
      transformMs: breakdown.transformMs,
      responseJsonMs: breakdown.responseJsonMs,
      roomCount: breakdown.roomCount,
      participantCount: breakdown.participantCount,
      roomsQueryRound1RoomIdCount: breakdown.roomsQueryRound1RoomIdCount,
      roomsQueryRound2RoomRowCount: breakdown.roomsQueryRound2RoomRowCount,
      roomsQueryRound2ParticipantRowCount: breakdown.roomsQueryRound2ParticipantRowCount,
      roomsQueryRound3RoomProfileCount: breakdown.roomsQueryRound3RoomProfileCount,
      unreadAggregation: breakdown.unreadAggregation,
      roomsQueryRounds: breakdown.roomsQueryRounds,
      additionalLookupRounds: breakdown.additionalLookupRounds,
      extraRoomsFetchRounds: breakdown.extraRoomsFetchRounds,
      hasPerRoomNPlusOne: breakdown.hasPerRoomNPlusOne,
    });
    return diagResponse;
  }
  const jsonBody = { ok: true as const, ...data };
  const tSerMain = performance.now();
  const serializedMain = JSON.stringify(jsonBody);
  const serializationMsMain = Math.round(performance.now() - tSerMain);
  const payloadUtf8BytesMain = Buffer.byteLength(serializedMain, "utf8");
  const tJson = performance.now();
  const response = new NextResponse(serializedMain, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  const responseJsonMs = Math.round(performance.now() - tJson);
  breakdown.responseJsonMs = responseJsonMs;
  logCmBootstrapV2({
    diagnostics,
    authMs,
    routeTotalMs: breakdown.routeTotalMs,
    serializationMs: serializationMsMain,
    payloadUtf8Bytes: payloadUtf8BytesMain,
    fullPayloadMs: fullPayloadAwaitMs,
  });
  logCmBootstrapBreakdown({
    diagnostics,
    authMs,
    routeTotalMs: breakdown.routeTotalMs,
    serializationMs: serializationMsMain,
    jsonResponseMs: responseJsonMs,
    payloadUtf8Bytes: payloadUtf8BytesMain,
    cacheHit,
    mode,
  });
  recordMessengerBootstrapBreakdown({
    capturedAt: breakdown.capturedAt,
    mode: breakdown.mode,
    cacheHit: breakdown.cacheHit,
    callsLogIncluded: breakdown.callsLogIncluded,
    discoverableIncluded: breakdown.discoverableIncluded,
    routeTotalMs: breakdown.routeTotalMs,
    authMs: breakdown.authMs,
    parallelInitialWallMs: breakdown.parallelInitialWallMs,
    roomsQueryMs: breakdown.roomsQueryMs,
    roomsQueryRound1Ms: breakdown.roomsQueryRound1Ms,
    roomsQueryRound2Ms: breakdown.roomsQueryRound2Ms,
    roomsQueryRound2RoomsMs: breakdown.roomsQueryRound2RoomsMs,
    roomsQueryRound2RoomsDbFetchMs: breakdown.roomsQueryRound2RoomsDbFetchMs,
    roomsQueryRound2RoomsNormalizeMs: breakdown.roomsQueryRound2RoomsNormalizeMs,
    roomsQueryRound2RoomsMergeMapMs: breakdown.roomsQueryRound2RoomsMergeMapMs,
    roomsQueryRound2RoomsHydrateLabelMs: breakdown.roomsQueryRound2RoomsHydrateLabelMs,
    roomsQueryRound2RoomsPayloadSerializeMs: breakdown.roomsQueryRound2RoomsPayloadSerializeMs,
    roomsQueryRound2ParticipantsMs: breakdown.roomsQueryRound2ParticipantsMs,
    roomsQueryRound3Ms: breakdown.roomsQueryRound3Ms,
    roomsQueryTransformMs: breakdown.roomsQueryTransformMs,
    roomsQueryPostprocessMs: breakdown.roomsQueryPostprocessMs,
    unreadMs: breakdown.unreadMs,
    profilesMs: breakdown.profilesMs,
    tradeContextMs: breakdown.tradeContextMs,
    callsLogMs: breakdown.callsLogMs,
    transformMs: breakdown.transformMs,
    responseJsonMs: breakdown.responseJsonMs,
    roomCount: breakdown.roomCount,
    participantCount: breakdown.participantCount,
    roomsQueryRound1RoomIdCount: breakdown.roomsQueryRound1RoomIdCount,
    roomsQueryRound2RoomRowCount: breakdown.roomsQueryRound2RoomRowCount,
    roomsQueryRound2ParticipantRowCount: breakdown.roomsQueryRound2ParticipantRowCount,
    roomsQueryRound3RoomProfileCount: breakdown.roomsQueryRound3RoomProfileCount,
    unreadAggregation: breakdown.unreadAggregation,
    roomsQueryRounds: breakdown.roomsQueryRounds,
    additionalLookupRounds: breakdown.additionalLookupRounds,
    extraRoomsFetchRounds: breakdown.extraRoomsFetchRounds,
    hasPerRoomNPlusOne: breakdown.hasPerRoomNPlusOne,
  });
  return response;
}
