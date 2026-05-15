/**
 * `GET /api/community-messenger/home-sync` 통합 단계 로그 — `[home-sync-deep-trace]`
 * (응답 shape·비즈니스 로직 불변, dev 또는 `SAMARKET_LOG_HOME_SYNC_DEEP_TRACE=1`)
 */
import { messengerTraceConsoleDebug } from "@/lib/community-messenger/messenger-trace-console";
import { ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";

export function homeSyncDeepTraceLogEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.SAMARKET_LOG_HOME_SYNC_DEEP_TRACE === "1";
}

function computeTopHomeSyncBottleneck(
  totalMs: number,
  parts: Record<string, number>
): { top_home_sync_bottleneck: string; top_home_sync_bottleneck_ms: number; top_home_sync_bottleneck_percent: number } {
  let top = "none";
  let topMs = 0;
  for (const [k, v] of Object.entries(parts)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > topMs) {
      topMs = n;
      top = k;
    }
  }
  const denom = totalMs > 0 ? totalMs : topMs > 0 ? topMs : 1;
  const pct = Math.round((topMs / denom) * 100);
  return {
    top_home_sync_bottleneck: top,
    top_home_sync_bottleneck_ms: Math.round(topMs),
    top_home_sync_bottleneck_percent: pct,
  };
}

export function logHomeSyncDeepTrace(input: {
  trace: HomeSyncTrace;
  routeTotalMs: number;
  routeBundleAwaitMs: number;
  routeDevDiagnosticsMs: number;
  devJsonSerializeMs: number;
  duplicateWindowCount: number;
  cache: {
    hit: boolean;
    fresh: boolean;
    cacheKey: string;
    prodCacheEnabled: boolean;
    lookupMs: number;
    storeMs: number;
    ttlMs: number;
    approximateAgeMs: number | null;
  };
}): void {
  const bs = input.trace.deepSteps.bundleSteps ?? {};
  const ur = input.trace.deepSteps.unreadHomeSyncSteps ?? {};
  const pp = input.trace.deepSteps.participantsProfiles;
  const trade = input.trace.deepSteps.tradeMetaEnrich;

  const home_sync_total_ms = ms(input.routeTotalMs);
  const home_sync_rooms_fetch_ms = ms(bs.roomsFetchMs ?? 0);
  const home_sync_room_summary_ms = ms(bs.summarizeRoomsMs ?? 0);
  const home_sync_unread_merge_ms = ms(bs.unreadBadgeMs ?? 0);
  const home_sync_participants_fetch_ms = ms(bs.participantsProfilesMs ?? 0);
  const home_sync_profiles_fetch_ms = ms(pp?.dbFetchMs ?? 0);
  const home_sync_trade_meta_ms = ms(trade?.totalMs ?? bs.tradeMetaEnrichTotalMs ?? 0);
  /** `fetchMyRoomsPayload` round2 `community_messenger_rooms` last_message_at 보조 조회 벽시계(있을 때만) */
  const home_sync_last_message_ms = ms(bs.roomsRound2RoomsDbFetchMs ?? 0);
  const home_sync_realtime_merge_ms = 0;
  const home_sync_payload_build_ms = ms(bs.payloadBuildMs ?? 0);
  const home_sync_json_serialize_ms = ms(input.devJsonSerializeMs);
  const unreadParallel = ur.unreadParallelWallMs ?? ur.unreadSourceFetchMs ?? 0;
  const home_sync_postgrest_wait_ms = ms(Math.max(0, (bs.roomsFetchMs ?? 0) + unreadParallel));

  const unread_room_count = ur.unreadRoomIdsCount ?? 0;
  const unread_total_messages = ur.unreadRowsFetched ?? 0;
  const unread_merge_iterations = ur.enrichInvocationCount ?? 0;
  const unread_merge_cpu_ms = ms(ur.unreadMergeCpuMs ?? 0);
  const unread_db_fetch_ms = ms(ur.unreadSourceFetchMs ?? 0);
  const unread_duplicate_merge_count = ur.unreadDuplicateFetchCount ?? 0;
  const unread_patch_apply_ms = ms(ur.unreadAttachCpuMs ?? 0);

  const home_sync_cache_hit = input.cache.hit ? 1 : 0;
  const home_sync_cache_ttl_ms = input.cache.ttlMs;
  const home_sync_cache_age_ms = input.cache.approximateAgeMs != null ? Math.round(input.cache.approximateAgeMs) : 0;

  const mem = process.memoryUsage();
  const heap_used_mb = Math.round(mem.heapUsed / 1024 / 1024);
  const rss_mb = Math.round(mem.rss / 1024 / 1024);

  const home_sync_singleflight_wait_ms = ms(bs.homeSyncSingleflightJoinWaitMs ?? 0);

  const phaseNums: Record<string, number> = {
    home_sync_total_ms,
    home_sync_rooms_fetch_ms,
    home_sync_room_summary_ms,
    home_sync_unread_merge_ms,
    home_sync_participants_fetch_ms,
    home_sync_profiles_fetch_ms,
    home_sync_trade_meta_ms,
    home_sync_last_message_ms,
    home_sync_realtime_merge_ms,
    home_sync_payload_build_ms,
    home_sync_json_serialize_ms,
    home_sync_postgrest_wait_ms,
    home_sync_cache_lookup_ms: ms(input.cache.lookupMs),
    home_sync_cache_store_ms: ms(input.cache.storeMs),
    home_sync_singleflight_wait_ms,
    route_bundle_await_ms: ms(input.routeBundleAwaitMs),
    route_dev_diagnostics_ms: ms(input.routeDevDiagnosticsMs),
    unread_merge_cpu_ms,
    unread_db_fetch_ms,
    unread_patch_apply_ms,
  };

  const topOnly: Record<string, number> = {
    home_sync_rooms_fetch_ms,
    home_sync_room_summary_ms,
    home_sync_unread_merge_ms,
    home_sync_participants_fetch_ms,
    home_sync_profiles_fetch_ms,
    home_sync_trade_meta_ms,
    home_sync_last_message_ms,
    home_sync_realtime_merge_ms,
    home_sync_payload_build_ms,
    home_sync_json_serialize_ms,
    home_sync_postgrest_wait_ms,
    home_sync_cache_lookup_ms: ms(input.cache.lookupMs),
    home_sync_cache_store_ms: ms(input.cache.storeMs),
    home_sync_singleflight_wait_ms,
    route_bundle_await_ms: ms(input.routeBundleAwaitMs),
    unread_merge_cpu_ms,
    unread_db_fetch_ms,
    unread_patch_apply_ms,
  };
  const top = computeTopHomeSyncBottleneck(home_sync_total_ms, topOnly);

  let home_sync_cache_reason = "miss";
  let home_sync_cache_bypass_reason = "";
  const route_cache_disabled_env = input.cache.prodCacheEnabled === false;
  if (!input.cache.prodCacheEnabled) {
    home_sync_cache_reason = "route_cache_disabled";
    home_sync_cache_bypass_reason = "SAMARKET_HOME_SYNC_DISABLE_ROUTE_CACHE=1";
  } else if (input.cache.fresh) {
    home_sync_cache_reason = "bypass";
    home_sync_cache_bypass_reason = "fresh=1";
  } else if (input.cache.hit) {
    home_sync_cache_reason = "hit";
    home_sync_cache_bypass_reason = "";
  } else {
    home_sync_cache_bypass_reason = "miss_or_expired_or_first_fill";
  }

  messengerTraceConsoleDebug("[home-sync-deep-trace]", {
    token: input.trace.token,
    tier: input.trace.tier,
    ...phaseNums,
    unread_room_count,
    unread_total_messages,
    unread_merge_iterations,
    unread_query_count: ur.unreadQueryCount ?? 0,
    unread_duplicate_merge_count,
    duplicate_window_count: input.duplicateWindowCount,
    home_sync_cache_hit,
    home_sync_cache_ttl_ms,
    home_sync_cache_age_ms,
    api_compile_ms: 0,
    api_render_ms: home_sync_json_serialize_ms,
    api_handler_only_ms: ms(bs.routeHandlerMs ?? 0),
    next_dev_compile_detected: 0,
    heap_used_mb,
    rss_mb,
    realtime_active_channel_count: 0,
    realtime_resubscribe_count: 0,
    realtime_reconnect_reason: "not_observable_on_server_route",
    realtime_duplicate_subscription_count: 0,
    realtime_home_sync_trigger_reason: "not_observable_on_server_route",
    realtime_bootstrap_refresh_count: 0,
    top_home_sync_bottleneck: top.top_home_sync_bottleneck,
    top_home_sync_bottleneck_ms: top.top_home_sync_bottleneck_ms,
    top_home_sync_bottleneck_percent: top.top_home_sync_bottleneck_percent,
    home_sync_cache_key: input.cache.cacheKey,
    home_sync_cache_reason,
    home_sync_cache_bypass_reason,
    route_cache_disabled_env,
    unread_legacy_fetch_path: ur.unreadLegacyFetchPath ?? null,
    unread_skip_reason: ur.unreadSkipReason ?? null,
    unread_slowest_query: ur.unreadSlowestQuery ?? null,
    unread_max_single_query_ms: ur.unreadMaxSingleQueryMs != null ? ms(ur.unreadMaxSingleQueryMs) : null,
    unread_rpc_bundle_ms: ur.unreadRpcBundleMs != null ? ms(ur.unreadRpcBundleMs) : null,
    unread_total_rows_note:
      "unread_total_messages maps unreadRowsFetched (legacy chat_rooms+product_chats row count), not DM message count",
    compile_scope_note:
      "api_compile_ms=0: route_handler_cannot_measure_turbopack; compare_home_sync_total_ms_dev_vs_prod_start",
    realtime_scope_note:
      "realtime_*=0 on server: subscription state lives in browser; correlate_client_console_with_this_request_token",
    postgrest_wait_formula_note:
      "home_sync_postgrest_wait_ms=roomsFetchMs+unreadParallelWall(or unreadSourceFetch)_sum_not_full_parallel_wall",
  });
}
