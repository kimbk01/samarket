import { homeSyncTraceMeterEnabled, ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";

/** dev 기본 ON, prod 는 `SAMARKET_HOME_SYNC_RUNTIME_PROFILE=1` 일 때만 콘솔 출력 */
export function shouldEmitHomeSyncRuntimeProfile(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SAMARKET_HOME_SYNC_RUNTIME_PROFILE === "1"
  );
}

function homeSyncCacheReason(params: {
  enableInMemoryCache: boolean;
  fresh: boolean;
  shortTtlHit: boolean;
  singleflightJoined: boolean;
}): string {
  if (!params.enableInMemoryCache) return "cache_disabled_env";
  if (params.fresh) return "bypass_fresh_query_param";
  if (params.shortTtlHit) return "hit_ttl_5s_in_process";
  if (params.singleflightJoined) return "miss_singleflight_follower_await";
  return "miss_bundle_leader_executed";
}

/**
 * home-sync 서버 런타임 1줄 프로파일 — 응답·계약 불변(콘솔만).
 * unread vs trade vs rooms vs await 판정용.
 */
export function emitHomeSyncRuntimeProfile(params: {
  trace: HomeSyncTrace;
  tier: "critical" | "full";
  fresh: boolean;
  enableInMemoryCache: boolean;
  shortTtlHit: boolean;
  singleflightJoined: boolean;
  routeTotalWallMs: number;
  routeBundleAwaitMs: number;
  routeDevDiagnosticsMs: number;
}): void {
  if (!homeSyncTraceMeterEnabled(params.trace) || !shouldEmitHomeSyncRuntimeProfile()) return;

  const bs = params.trace.deepSteps.bundleSteps ?? {};
  const tradeMeta = params.trace.deepSteps.tradeMetaEnrich;
  const tradeMetaMs = Math.max(ms(bs.tradeMetaEnrichTotalMs ?? 0), ms(tradeMeta?.totalMs ?? 0));

  const roomsFetch = ms(bs.roomsFetchMs);
  const participantsProfiles = ms(bs.participantsProfilesMs);
  const unreadBadge = ms(bs.unreadBadgeMs);
  const payloadBuild = ms(bs.payloadBuildMs);
  const summarizeRooms = ms(bs.summarizeRoomsMs);
  const routeAwait = ms(params.routeBundleAwaitMs);
  const routeDevDiag = ms(params.routeDevDiagnosticsMs);
  const listWall = ms(bs.listMyChatsWallMs);
  const friendsFetch = ms(bs.friendsFetchMs);
  const friendsReq = ms(bs.friendsRequestsFetchMs);
  const bundleParallelWall = ms(bs.bundleParallelWallMs);
  const dynamicImport = ms(bs.routeBundleDynamicImportMs ?? 0);
  const commerceLifecycleEnrich = ms(bs.commerceLifecycleEnrichMs ?? 0);
  const commerceLifecycleTrade = ms(bs.commerceLifecycleTradeMs ?? 0);
  const commerceLifecycleDelivery = ms(bs.commerceLifecycleDeliveryMs ?? 0);
  const explainedColdMs =
    dynamicImport +
    roomsFetch +
    participantsProfiles +
    unreadBadge +
    commerceLifecycleEnrich +
    payloadBuild +
    summarizeRooms;
  const coldGapResidualMs = params.shortTtlHit ? 0 : Math.max(0, routeAwait - explainedColdMs);

  const candidates: Array<[string, number]> = [
    ["rooms_fetch", roomsFetch],
    ["participants_profiles", participantsProfiles],
    ["unread_badge", unreadBadge],
    ["trade_meta", tradeMetaMs],
    ["payload_build", payloadBuild],
    ["summarize_rooms", summarizeRooms],
    ["route_bundle_await", routeAwait],
    ["route_bundle_dynamic_import", dynamicImport],
    ["commerce_lifecycle_enrich", commerceLifecycleEnrich],
    ["commerce_lifecycle_trade", commerceLifecycleTrade],
    ["commerce_lifecycle_delivery", commerceLifecycleDelivery],
    ["cold_gap_residual", coldGapResidualMs],
    ["route_dev_diagnostics", routeDevDiag],
    ["list_my_chats_wall", listWall],
    ["friends_fetch", friendsFetch],
    ["friends_requests_fetch", friendsReq],
    ["bundle_parallel_wall", bundleParallelWall],
  ];

  let top: { key: string; ms: number } | null = null;
  for (const [key, v] of candidates) {
    if (v <= 0) continue;
    if (!top || v > top.ms) top = { key, ms: v };
  }

  const payload = {
    home_sync_total_ms: ms(params.routeTotalWallMs),
    home_sync_bundle_total_ms: ms(bs.bundleTotalMs ?? 0),
    home_sync_rooms_fetch_ms: roomsFetch,
    home_sync_participants_profiles_ms: participantsProfiles,
    home_sync_unread_badge_ms: unreadBadge,
    home_sync_trade_meta_ms: tradeMetaMs,
    home_sync_payload_build_ms: payloadBuild,
    home_sync_cache_hit: params.shortTtlHit,
    home_sync_cache_reason: homeSyncCacheReason({
      enableInMemoryCache: params.enableInMemoryCache,
      fresh: params.fresh,
      shortTtlHit: params.shortTtlHit,
      singleflightJoined: params.singleflightJoined,
    }),
    home_sync_route_bundle_await_ms: routeAwait,
    /** `getCommunityMessengerHomeSyncBundle` 벽시계와 동일 스케일(캐시 히트 시 0) */
    home_sync_fetch_ms: params.shortTtlHit ? 0 : routeAwait,
    home_sync_singleflight_join_wait_ms: ms(bs.homeSyncSingleflightJoinWaitMs ?? 0),
    home_sync_list_my_chats_wall_ms: listWall,
    home_sync_friends_fetch_ms: friendsFetch,
    home_sync_friends_requests_fetch_ms: friendsReq,
    home_sync_bundle_parallel_wall_ms: bundleParallelWall,
    home_sync_route_dev_diagnostics_ms: routeDevDiag,
    home_sync_summarize_rooms_ms: summarizeRooms,
    home_sync_bundle_dynamic_import_ms: dynamicImport,
    home_sync_commerce_lifecycle_enrich_ms: commerceLifecycleEnrich,
    home_sync_commerce_lifecycle_trade_ms: commerceLifecycleTrade,
    home_sync_commerce_lifecycle_delivery_ms: commerceLifecycleDelivery,
    home_sync_cold_gap_explained_ms: explainedColdMs,
    home_sync_cold_gap_residual_ms: coldGapResidualMs,
    home_sync_top_bottleneck: top?.key ?? "none",
    home_sync_top_bottleneck_ms: top?.ms ?? 0,
    trade_meta_cache_hit: tradeMeta?.tradeMetaCacheHit ?? null,
    trade_meta_cache_miss_reason: tradeMeta?.tradeMetaCacheMissReason ?? null,
    trade_meta_duplicate_room_count: tradeMeta?.tradeMetaDuplicateRoomCount ?? null,
    trade_meta_duplicate_post_count: tradeMeta?.tradeMetaDuplicatePostCount ?? null,
    trade_meta_duplicate_seller_count: tradeMeta?.tradeMetaDuplicateSellerCount ?? null,
    trade_meta_parallel_wait_ms: tradeMeta?.tradeMetaParallelWaitMs ?? null,
    trade_meta_query_count: tradeMeta?.tradeMetaQueryCount ?? null,
    trade_meta_singleflight_hit: tradeMeta?.tradeMetaSingleflightHit ?? null,
    trade_meta_top_bottleneck: tradeMeta?.tradeMetaTopBottleneck ?? null,
    trade_meta_top_bottleneck_ms: tradeMeta?.tradeMetaTopBottleneckMs ?? null,
    token: params.trace.token,
    tier: params.tier,
  };

  // eslint-disable-next-line no-console -- gated: dev 또는 SAMARKET_HOME_SYNC_RUNTIME_PROFILE
  console.info("[home-sync-runtime-profile]", JSON.stringify(payload));
}
