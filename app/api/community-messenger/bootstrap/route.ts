import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  getCommunityMessengerBootstrap,
  listCommunityMessengerCallLogs,
  type CommunityMessengerBootstrapDiagnostics,
} from "@/lib/community-messenger/service";
import {
  recordMessengerApiTiming,
  recordMessengerBootstrapBreakdown,
} from "@/lib/community-messenger/monitoring/server-store";
import type { MessengerBootstrapBreakdown } from "@/lib/community-messenger/monitoring/types";

const COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS = 8_000;

type CommunityMessengerBootstrapCacheEntry = {
  payload: Awaited<ReturnType<typeof getCommunityMessengerBootstrap>>;
  expiresAt: number;
};

const communityMessengerBootstrapCache = new Map<string, CommunityMessengerBootstrapCacheEntry>();

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

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const lite = request.nextUrl.searchParams.get("lite") === "1";
  const mode: MessengerBootstrapBreakdown["mode"] = fresh ? "fresh" : lite ? "lite" : "full";
  const cacheKey = `${auth.userId}:${lite ? "lite" : "full"}`;
  for (const [key, entry] of communityMessengerBootstrapCache) {
    if (entry.expiresAt <= Date.now()) {
      communityMessengerBootstrapCache.delete(key);
    }
  }

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
  };
  const cacheHit = Boolean(data) && !fresh;
  if (!data || fresh) {
    data = await getCommunityMessengerBootstrap(auth.userId, {
      skipDiscoverable: lite,
      deferCallLog: lite,
      diagnostics,
      detailedTimingBreakdown: bootstrapDiag,
    });
    communityMessengerBootstrapCache.set(cacheKey, {
      payload: data,
      expiresAt: Date.now() + COMMUNITY_MESSENGER_BOOTSTRAP_TTL_MS,
    });
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
    const tDiagJson = performance.now();
    const diagResponse = NextResponse.json({
      ok: true,
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
    });
    breakdown.responseJsonMs = Math.round(performance.now() - tDiagJson);
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
  const tJson = performance.now();
  const response = NextResponse.json({ ok: true, ...data });
  const responseJsonMs = Math.round(performance.now() - tJson);
  breakdown.responseJsonMs = responseJsonMs;
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
