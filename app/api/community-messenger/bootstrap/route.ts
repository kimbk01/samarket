import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import type { CommunityMessengerBootstrapDiagnostics } from "@/lib/community-messenger/service";
import type { MessengerBootstrapBreakdown } from "@/lib/community-messenger/monitoring/types";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";
import {
  sampleFromBootstrapDiagnostics,
  warnBootstrapLitePerformanceLockIfNeeded,
} from "@/lib/community-messenger/bootstrap-lite-performance-lock";

/** 1단계: `[cm-bootstrap-v2]` — 동작 변경 없이 관측만 (critical tier 분리 전) */
function logCmBootstrapV2(params: {
  diagnostics: CommunityMessengerBootstrapDiagnostics;
  authMs: number;
  routeTotalMs: number;
  serializationMs: number;
  payloadUtf8Bytes: number;
  /** 라우트에서 `getCommunityMessengerBootstrap` 대기 구간(ms); critical 분리 전엔 곧 full monolith */
  fullPayloadMs: number;
  /** `?lite=1` — perf lock warn 대상 */
  isLite?: boolean;
}) {
  const d = params.diagnostics;
  if (params.isLite) {
    const payloadKb = Math.round((params.payloadUtf8Bytes / 1024) * 1000) / 1000;
    warnBootstrapLitePerformanceLockIfNeeded({
      sample: sampleFromBootstrapDiagnostics({
        diagnostics: d,
        routeTotalMs: params.routeTotalMs,
        payloadKb,
      }),
      requestKey: `${params.routeTotalMs}:${d.bootstrapLiteRoomsFetchPath}:${d.roomCount}`,
    });
  }
  if (!messengerVerboseTraceConsoleEnabled()) return;
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
    ["enrich_trade_posts_fetch_ms", d.enrichTradePostsFetchMs],
    ["enrich_trade_category_fetch_ms", d.enrichTradeCategoryFetchMs],
    ["enrich_trade_seller_fetch_ms", d.enrichTradeSellerHydrateMs],
    ["enrich_trade_cpu_merge_ms", d.enrichTradeCpuMergeMs],
    ["enrich_trade_hidden_fallback_ms", d.enrichTradeHiddenFallbackMs],
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
      enrich_trade_posts_fetch_ms: d.enrichTradePostsFetchMs,
      enrich_trade_category_fetch_ms: d.enrichTradeCategoryFetchMs,
      enrich_trade_seller_fetch_ms: d.enrichTradeSellerHydrateMs,
      enrich_trade_cpu_merge_ms: d.enrichTradeCpuMergeMs,
      enrich_trade_normalize_ms: d.enrichTradeNormalizeMs,
      enrich_trade_hidden_fallback_ms: d.enrichTradeHiddenFallbackMs,
      bootstrap_lite_trade_enrich_fast_path: d.bootstrapLiteTradeEnrichFastPath,
      bootstrap_lite_trade_heavy_pipeline_skipped: d.bootstrapLiteTradeHeavyPipelineSkipped,
      bootstrap_lite_heavy_target_count_before: d.bootstrapLiteHeavyTargetCountBefore,
      bootstrap_lite_heavy_target_count_after_direct_keys: d.bootstrapLiteHeavyTargetCountAfterDirectKeys,
      bootstrap_lite_heavy_target_reasons_top: d.bootstrapLiteHeavyTargetReasonsTop,
      bootstrap_lite_missing_only_batch_ms: d.bootstrapLiteMissingOnlyBatchMs,
      bootstrap_lite_middle_pipeline_blocked: d.bootstrapLiteMiddlePipelineBlocked,
      bootstrap_lite_deferred_hydration_count: d.bootstrapLiteDeferredHydrationCount,
      bootstrap_lite_direct_keys_mega_rpc_ms: d.bootstrapLiteDirectKeysMegaRpcMs,
      bootstrap_lite_direct_keys_mega_cache_reason: d.bootstrapLiteDirectKeysMegaCacheReason,
      bootstrap_lite_direct_keys_prefetch_wait_ms: d.bootstrapLiteDirectKeysPrefetchWaitMs,
      bootstrap_lite_direct_keys_parse_apply_ms: d.bootstrapLiteDirectKeysParseApplyMs,
      bootstrap_lite_direct_keys_mega_network_ms: d.bootstrapLiteDirectKeysMegaNetworkMs,
      bootstrap_lite_rooms_fetch_ms: d.bootstrapLiteRoomsFetchMs,
      bootstrap_lite_friends_fetch_ms: d.bootstrapLiteFriendsFetchMs,
      bootstrap_lite_requests_fetch_ms: d.bootstrapLiteRequestsFetchMs,
      bootstrap_lite_favorite_fetch_ms: d.bootstrapLiteFavoriteFetchMs,
      bootstrap_lite_discoverable_fetch_ms: d.bootstrapLiteDiscoverableFetchMs,
      bootstrap_lite_meetings_fetch_ms: d.bootstrapLiteMeetingsFetchMs,
      bootstrap_lite_parallel_slowest_stage: d.bootstrapLiteParallelSlowestStage,
      bootstrap_lite_parallel_slowest_ms: d.bootstrapLiteParallelSlowestMs,
      bootstrap_lite_social_graph_source: d.bootstrapLiteSocialGraphSource,
      bootstrap_lite_room_ids_rpc_ms: d.bootstrapLiteRoomIdsRpcMs,
      bootstrap_lite_rooms_meta_fetch_ms: d.bootstrapLiteRoomsMetaFetchMs,
      bootstrap_lite_participants_join_ms: d.bootstrapLiteParticipantsJoinMs,
      bootstrap_lite_last_message_fetch_ms: d.bootstrapLiteLastMessageFetchMs,
      bootstrap_lite_room_payload_map_ms: d.bootstrapLiteRoomPayloadMapMs,
      bootstrap_lite_rooms_query_slowest_stage: d.bootstrapLiteRoomsQuerySlowestStage,
      bootstrap_lite_rooms_query_slowest_ms: d.bootstrapLiteRoomsQuerySlowestMs,
      bootstrap_lite_rooms_rpc_cache_hit: d.bootstrapLiteRoomsRpcCacheHit,
      bootstrap_lite_rooms_cache_bypass: d.bootstrapLiteRoomsCacheBypass,
      bootstrap_lite_room_count_diag: d.bootstrapLiteRoomCount,
      bootstrap_lite_participant_count_diag: d.bootstrapLiteParticipantCount,
      bootstrap_lite_rooms_fetch_path: d.bootstrapLiteRoomsFetchPath,
      bootstrap_lite_profiles_fetch_ms: d.bootstrapLiteProfilesFetchMs,
      bootstrap_lite_profiles_bundle_embedded_count: d.bootstrapLiteProfilesBundleEmbeddedCount,
      bootstrap_lite_profiles_miss_fetch_count: d.bootstrapLiteProfilesMissFetchCount,
      lite_trade_enrich_skipped: d.bootstrapLiteTradeHeavyPipelineSkipped,
      lite_trade_enrich_ran: tradeEnrichMs > 0,
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
      enrich_trade_posts_fetch_ms: d.enrichTradePostsFetchMs,
      enrich_trade_category_fetch_ms: d.enrichTradeCategoryFetchMs,
      enrich_trade_cpu_merge_ms: d.enrichTradeCpuMergeMs,
      enrich_trade_normalize_ms: d.enrichTradeNormalizeMs,
      enrich_trade_hidden_fallback_ms: d.enrichTradeHiddenFallbackMs,
      bootstrap_lite_trade_enrich_fast_path: d.bootstrapLiteTradeEnrichFastPath,
      bootstrap_lite_trade_heavy_pipeline_skipped: d.bootstrapLiteTradeHeavyPipelineSkipped,
      bootstrap_lite_heavy_target_count_before: d.bootstrapLiteHeavyTargetCountBefore,
      bootstrap_lite_heavy_target_count_after_direct_keys: d.bootstrapLiteHeavyTargetCountAfterDirectKeys,
      bootstrap_lite_heavy_target_reasons_top: d.bootstrapLiteHeavyTargetReasonsTop,
      bootstrap_lite_missing_only_batch_ms: d.bootstrapLiteMissingOnlyBatchMs,
      bootstrap_lite_middle_pipeline_blocked: d.bootstrapLiteMiddlePipelineBlocked,
      bootstrap_lite_deferred_hydration_count: d.bootstrapLiteDeferredHydrationCount,
      bootstrap_lite_direct_keys_mega_rpc_ms: d.bootstrapLiteDirectKeysMegaRpcMs,
      bootstrap_lite_direct_keys_mega_cache_reason: d.bootstrapLiteDirectKeysMegaCacheReason,
      bootstrap_lite_direct_keys_prefetch_wait_ms: d.bootstrapLiteDirectKeysPrefetchWaitMs,
      bootstrap_lite_direct_keys_parse_apply_ms: d.bootstrapLiteDirectKeysParseApplyMs,
      bootstrap_lite_direct_keys_mega_network_ms: d.bootstrapLiteDirectKeysMegaNetworkMs,
      bootstrap_lite_rooms_fetch_ms: d.bootstrapLiteRoomsFetchMs,
      bootstrap_lite_friends_fetch_ms: d.bootstrapLiteFriendsFetchMs,
      bootstrap_lite_requests_fetch_ms: d.bootstrapLiteRequestsFetchMs,
      bootstrap_lite_favorite_fetch_ms: d.bootstrapLiteFavoriteFetchMs,
      bootstrap_lite_discoverable_fetch_ms: d.bootstrapLiteDiscoverableFetchMs,
      bootstrap_lite_meetings_fetch_ms: d.bootstrapLiteMeetingsFetchMs,
      bootstrap_lite_parallel_slowest_stage: d.bootstrapLiteParallelSlowestStage,
      bootstrap_lite_parallel_slowest_ms: d.bootstrapLiteParallelSlowestMs,
      bootstrap_lite_social_graph_source: d.bootstrapLiteSocialGraphSource,
      bootstrap_lite_room_ids_rpc_ms: d.bootstrapLiteRoomIdsRpcMs,
      bootstrap_lite_rooms_meta_fetch_ms: d.bootstrapLiteRoomsMetaFetchMs,
      bootstrap_lite_participants_join_ms: d.bootstrapLiteParticipantsJoinMs,
      bootstrap_lite_last_message_fetch_ms: d.bootstrapLiteLastMessageFetchMs,
      bootstrap_lite_room_payload_map_ms: d.bootstrapLiteRoomPayloadMapMs,
      bootstrap_lite_rooms_query_slowest_stage: d.bootstrapLiteRoomsQuerySlowestStage,
      bootstrap_lite_rooms_query_slowest_ms: d.bootstrapLiteRoomsQuerySlowestMs,
      bootstrap_lite_rooms_rpc_cache_hit: d.bootstrapLiteRoomsRpcCacheHit,
      bootstrap_lite_rooms_cache_bypass: d.bootstrapLiteRoomsCacheBypass,
      worst_stage: worstStage,
      worst_stage_ms: worstMs,
      timings_valid: timingsValid,
      cache_hit: params.cacheHit,
      mode: params.mode,
      lite_trade_enrich_skipped: d.bootstrapLiteTradeHeavyPipelineSkipped,
      lite_trade_enrich_ran: d.tradeContextMs > 0,
      background_hydration_scheduled: params.mode === "lite",
      note: timingsValid ? undefined : "per-stage timings require cache miss or ?fresh=1",
    })
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS = 8_000;
/** `userId:lite|full` 키가 늘어나도 프로세스 메모리가 비한정으로 커지지 않게 상한(만료 + FIFO) */
const COMMUNITY_MESSENGER_BOOTSTRAP_CACHE_MAX_ENTRIES = 500;

function snapshotResponseHeaders(snapshotVia?: string): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-cm-bootstrap-snapshot-path": "1",
    "x-samarket-cm-bootstrap-snapshot-via": snapshotVia,
    "x-samarket-cm-bootstrap-query-wave-2-ms": "0",
    "x-samarket-cm-bootstrap-rpc-removed": "1",
  };
}

type CommunityMessengerBootstrapCacheEntry = {
  payload: CommunityMessengerBootstrap;
  expiresAt: number;
};

const communityMessengerBootstrapCache = new Map<string, CommunityMessengerBootstrapCacheEntry>();
const communityMessengerBootstrapInflight = new Map<string, Promise<CommunityMessengerBootstrap>>();

export async function GET(request: NextRequest) {
  const t0 = performance.now();
  const tAuth = performance.now();
  const bootstrapDiag = request.nextUrl.searchParams.get("bootstrap_diag") === "1";
  const auth = await requireAuthenticatedUserId();
  const authMs = Math.round(performance.now() - tAuth);
  if (!auth.ok) return auth.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "messenger_open"
  );
  if (!profileGate.ok) return profileGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:bootstrap:${getRateLimitKey(request, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메신저 초기 데이터 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_bootstrap_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const [svc, timing, storeRec] = await Promise.all([
    import("@/lib/community-messenger/service"),
    import("@/lib/community-messenger/monitoring/messenger-api-route-timing"),
    import("@/lib/community-messenger/monitoring/server-store-record"),
  ]);
  const {
    getCommunityMessengerBootstrap,
    getCommunityMessengerBootstrapCritical,
    listCommunityMessengerCallLogs,
  } = svc;
  const { recordMessengerApiTiming } = timing;
  const { recordMessengerBootstrapBreakdown } = storeRec;

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
    const cmBootstrapBypass =
      request.nextUrl.searchParams.get("cmBootstrapBypass") === "1" &&
      process.env.NODE_ENV === "development";
    let criticalPayload: Awaited<
      ReturnType<typeof getCommunityMessengerBootstrapCritical>
    > | null = null;
    let snapshotVia: string | undefined;

    const { tryCreateSupabaseServiceClient } = await import("@/lib/supabase/try-supabase-server");
    const { tryLoadCriticalBootstrapFromSnapshot } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot"
    );
    const sbSnap = tryCreateSupabaseServiceClient();
    if (sbSnap) {
      const snap = await tryLoadCriticalBootstrapFromSnapshot(sbSnap as never, auth.userId, {
        bypassCounter: cmBootstrapBypass,
      });
      if (snap) {
        snapshotVia = snap.snapshotVia;
        criticalPayload = {
          payload: snap.payload,
          criticalPayloadMs: snap.breakdown.db_ms,
          dbRoundTrips: snap.breakdown.round_trips,
          roomCount: snap.payload.chats.length + snap.payload.groups.length,
          tierDiagnostics: {
            roomsQueryMs: snap.breakdown.room_fetch_ms,
            participantsQueryMs: 0,
            roomsPayloadDbRoundTrips: snap.breakdown.round_trips,
            profilesMs: snap.breakdown.profile_join_ms,
            unreadMs: snap.breakdown.unread_compute_ms,
            criticalCpuMergeMs: snap.breakdown.room_summary_compute_ms,
            criticalSkippedRoomProfiles: true,
            criticalReusedPayloadByRoomId: true,
            dbRoundTrips: snap.breakdown.round_trips,
          },
        };
      }
    }

    if (!criticalPayload) {
      return NextResponse.json(
        { ok: false, error: "snapshot_unavailable" },
        { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }

    const critical = criticalPayload;
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
        ...snapshotResponseHeaders(snapshotVia),
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
    enrichTradePostsFetchMs: 0,
    enrichTradeCategoryFetchMs: 0,
    enrichTradeCpuMergeMs: 0,
    enrichTradeNormalizeMs: 0,
    enrichTradeHiddenFallbackMs: 0,
    bootstrapLiteTradeEnrichFastPath: false,
    bootstrapLiteTradeHeavyPipelineSkipped: false,
    bootstrapLiteHeavyTargetCountBefore: 0,
    bootstrapLiteHeavyTargetCountAfterDirectKeys: 0,
    bootstrapLiteHeavyTargetReasonsTop: "",
    bootstrapLiteMissingOnlyBatchMs: 0,
    bootstrapLiteMiddlePipelineBlocked: false,
    bootstrapLiteDeferredHydrationCount: 0,
    bootstrapLiteDirectKeysMegaRpcMs: 0,
    bootstrapLiteDirectKeysMegaCacheReason: "",
    bootstrapLiteDirectKeysPrefetchWaitMs: 0,
    bootstrapLiteDirectKeysParseApplyMs: 0,
    bootstrapLiteDirectKeysMegaNetworkMs: 0,
    bootstrapMonolithWallMs: 0,
    bootstrapLiteRoomsFetchMs: 0,
    bootstrapLiteFriendsFetchMs: 0,
    bootstrapLiteRequestsFetchMs: 0,
    bootstrapLiteFavoriteFetchMs: 0,
    bootstrapLiteDiscoverableFetchMs: 0,
    bootstrapLiteMeetingsFetchMs: 0,
    bootstrapLiteParallelSlowestStage: "",
    bootstrapLiteParallelSlowestMs: 0,
    bootstrapLiteSocialGraphSource: "n/a",
    bootstrapLiteRoomIdsRpcMs: 0,
    bootstrapLiteRoomsMetaFetchMs: 0,
    bootstrapLiteParticipantsJoinMs: 0,
    bootstrapLiteLastMessageFetchMs: 0,
    bootstrapLiteRoomPayloadMapMs: 0,
    bootstrapLiteRoomsQuerySlowestStage: "",
    bootstrapLiteRoomsQuerySlowestMs: 0,
    bootstrapLiteRoomsRpcCacheHit: false,
    bootstrapLiteRoomsCacheBypass: fresh,
    bootstrapLiteRoomCount: 0,
    bootstrapLiteParticipantCount: 0,
    bootstrapLiteRoomsFetchPath: "legacy",
    bootstrapLiteProfilesBundleEmbeddedCount: 0,
    bootstrapLiteProfilesMissFetchCount: 0,
    bootstrapLiteProfilesFetchMs: 0,
  };
  const cacheHit = Boolean(data) && !fresh;
  let fullPayloadAwaitMs = 0;
  let snapshotVia: string | undefined;
  if (!data || fresh) {
    const tFullPayload = performance.now();
    const cmBootstrapBypass =
      request.nextUrl.searchParams.get("cmBootstrapBypass") === "1" &&
      process.env.NODE_ENV === "development";

    if (lite && !bootstrapDiag) {
      const { tryCreateSupabaseServiceClient } = await import("@/lib/supabase/try-supabase-server");
      const { tryLoadCmBootstrapLiteFromSnapshot } = await import(
        "@/lib/community-messenger/cm-bootstrap-snapshot"
      );
      const sbSnap = tryCreateSupabaseServiceClient();
      if (sbSnap) {
        const snap = await tryLoadCmBootstrapLiteFromSnapshot(sbSnap as never, auth.userId, {
          bypassCounter: fresh || cmBootstrapBypass,
        });
        if (snap) {
          data = snap.payload;
          snapshotVia = snap.snapshotVia;
          diagnostics.roomCount = snap.payload.chats.length + snap.payload.groups.length;
          diagnostics.participantCount = snap.payload.chats.reduce(
            (n, room) => n + (room.memberCount ?? 0),
            0
          );
          diagnostics.bootstrapLiteRoomsFetchPath = "bundle_rpc";
          diagnostics.roomsPayloadDbRoundTrips = snap.breakdown.round_trips;
          diagnostics.roomsQueryMs = snap.breakdown.room_list_fetch_ms;
          diagnostics.profilesMs = snap.breakdown.profile_join_ms;
          diagnostics.unreadMs = snap.breakdown.unread_compute_ms;
          diagnostics.transformMs = snap.breakdown.payload_build_ms;
          diagnostics.tradeContextMs = 0;
          diagnostics.bootstrapLiteTradeEnrichFastPath = true;
          diagnostics.bootstrapLiteTradeHeavyPipelineSkipped = true;
          diagnostics.unreadAggregation =
            "community_messenger_participants.unread_count + trade legacy unread batch max merge";
        }
      }
    } else if (!lite && !bootstrapDiag) {
      const { tryCreateSupabaseServiceClient } = await import("@/lib/supabase/try-supabase-server");
      const { tryLoadFullBootstrapFromSnapshot } = await import(
        "@/lib/community-messenger/full-bootstrap-snapshot"
      );
      const sbFull = tryCreateSupabaseServiceClient();
      if (sbFull) {
        const snap = await tryLoadFullBootstrapFromSnapshot(sbFull as never, auth.userId, {
          bypassCounter: fresh || cmBootstrapBypass,
        });
        if (snap) {
          data = snap.payload;
          snapshotVia = snap.snapshotVia;
          diagnostics.roomCount = snap.payload.chats.length + snap.payload.groups.length;
          diagnostics.participantCount = snap.payload.chats.reduce(
            (n, room) => n + (room.memberCount ?? 0),
            0
          );
          diagnostics.bootstrapLiteRoomsFetchPath = "full_bundle_rpc";
          diagnostics.roomsPayloadDbRoundTrips = snap.breakdown.round_trips;
          diagnostics.roomsQueryMs = snap.breakdown.room_fetch_ms;
          diagnostics.profilesMs = snap.breakdown.profile_join_ms;
          diagnostics.unreadMs = snap.breakdown.unread_compute_ms;
          diagnostics.transformMs = snap.breakdown.payload_build_ms;
          diagnostics.tradeContextMs = snap.breakdown.trade_context_merge_ms;
          diagnostics.callsLogIncluded = true;
          diagnostics.discoverableIncluded = true;
          diagnostics.unreadAggregation =
            "community_messenger_participants.unread_count + trade legacy unread batch max merge";
        }
      }
    }

    if (!data) {
      if (!bootstrapDiag) {
        return NextResponse.json(
          { ok: false, error: "snapshot_unavailable" },
          { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
        );
      }
      data = await (lite
        ? getCommunityMessengerBootstrap(auth.userId, {
            skipDiscoverable: true,
            deferCallLog: true,
            diagnostics,
            bypassLiteRoomsCache: fresh,
          })
        : getCommunityMessengerBootstrap(auth.userId, {
            skipDiscoverable: false,
            deferCallLog: false,
            diagnostics,
            bypassLiteRoomsCache: fresh,
          }));
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
      isLite: lite,
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...snapshotResponseHeaders(snapshotVia),
    },
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
    isLite: lite,
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
