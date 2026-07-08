export type HomeSyncDeepStepsParticipantsProfiles = {
  dbFetchMs: number;
  profileMergeMs: number;
  participantNormalizeMs: number;
  dedupeMs: number;
  missingMs: number;
  totalMs: number;
  ids: number;
  fetched: number;
};

export type HomeSyncDeepStepsTradeDirectKeys = {
  wallMs: number;
  pcFromKeyQueryMs: number;
  chatRoomsQueryMs: number;
  pcCandidatesQueryMs: number;
  postsFetchMs: number;
  categoryEnsureMs: number;
  /** HS3-RETRY: item_trade chat_rooms + pc 후보를 단일 RPC로 묶은 경우 전용 RTT */
  itemTradeLedgerBundleRpcMs?: number;
  /** HS3-FINAL: critical mega RPC (ledger + posts 한 왕복) */
  bundleRpcMs?: number;
  phase1WallMs?: number;
  phase2WallMs?: number;
  /** tDirectWall 기준 posts fetch 시작까지 */
  postsStartAfterMs?: number;
  /** tDirectWall 기준 pc 후보 SQL/RPC 시작까지 */
  pcCandidatesStartAfterMs?: number;
  /** posts 로드 완료 후 category ensure 벽시계 */
  categoryAfterPostsMs?: number;
  /** 개별 쿼리 ms 합산 대비 phase 벽시계로 추정한 중복 제거 이득(참고) */
  effectiveParallelGainMs?: number;
  /** HS3-FINAL: 직렬 의존 설명(로그·재발 방지) */
  phaseDependencyReason?: string;
  /** HS3-FINAL: 클라이언트 왕복으로 계산한 유효 RTT 개수(목표 1) */
  effectiveRttCount?: number;
  /** HS3-FINAL: 다중 RTT 제거로 절약한 벽시계 추정 */
  parallelEfficiencyMs?: number;
  /** mega/legacy 공통 — apply 루프·맵 구축 등 orchestration 진단(perf) */
  direct_keys_duplicate_merge_count?: number;
  direct_keys_map_rebuild_count?: number;
  direct_keys_duplicate_normalize_count?: number;
  direct_keys_bridge_attach_iterations?: number;
  direct_keys_category_attach_iterations?: number;
  direct_keys_object_spread_count?: number;
  direct_keys_hot_cpu_loop?: number;
  direct_keys_hidden_sequential_wait_ms?: number;
  direct_keys_lookup_rebuild_count?: number;
  direct_keys_apply_loop_ms?: number;
  direct_keys_lookup_rebuild_count_after?: number;
  direct_keys_map_rebuild_count_after?: number;
  /** mega/legacy — 스냅샷·singleflight 진단(응답 shape 무관) */
  direct_keys_cache_key?: string;
  direct_keys_normalized_cache_key?: string;
  direct_keys_cache_reason?: string;
  direct_keys_singleflight_key?: string;
  direct_keys_singleflight_join_count?: number;
  direct_keys_cache_ttl_ms?: number;
  direct_keys_cache_store_ms?: number;
  direct_keys_cache_lookup_ms?: number;
  direct_keys_bridge_cache_hit_after?: boolean;
  direct_keys_category_cache_hit_after?: boolean;
  direct_keys_category_batch_singleflight_joins?: number;
  direct_keys_mega_map_sync_ms?: number;
  direct_keys_mega_inflight_or_rpc_wait_ms?: number;
  direct_keys_lookup_reuse_hit?: boolean;
  direct_keys_lookup_cpu_ms?: number;
  direct_keys_normalize_cpu_ms?: number;
  direct_keys_key_build_cpu_ms?: number;
  /** mega RPC 응답 파싱 후 무결성 실패 시 legacy 로 폴백하기 직전(계측만) */
  mega_bundle_integrity_ok?: boolean;
  mega_bundle_integrity_ledger_pc_ok?: boolean;
  mega_bundle_integrity_ledger_cr_ok?: boolean;
  mega_bundle_integrity_posts_ok?: boolean;
};

/**
 * `POST trade-chat-list-meta` 전용 — `enrichTradeRoomContextMetaFromDirectKeys` 내부 RTT·CPU 분해.
 * 응답·메타 의미 변경 없음(perf 로그만).
 */
export type HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown = {
  direct_keys_total_ms: number;
  direct_keys_path: "mega_bundle" | "legacy_parallel" | "early_exit";
  direct_keys_post_ids_count: number;
  direct_keys_room_ids_count: number;
  direct_keys_trade_pc_ids_count: number;
  direct_keys_item_trade_room_ids_count: number;
  direct_keys_fetch_posts_ms: number;
  /** mega `home_sync_direct_keys_critical_bundle` 또는 legacy item_trade RPC/chat_rooms */
  direct_keys_fetch_bridge_ms: number;
  /** `product_chats` by id + legacy pcCandidates( post_id in ) */
  direct_keys_fetch_product_chat_ms: number;
  direct_keys_fetch_category_ms: number;
  /** direct keys 경로에서 seller 프로필 조회 없음 — 0 고정 */
  direct_keys_fetch_seller_ms: number;
  /** 요청 스코프 postRowCache 조회만(미세) — 현재 0 */
  direct_keys_cache_lookup_ms: number;
  direct_keys_cache_hit_count: number;
  direct_keys_cache_miss_count: number;
  direct_keys_query_count: number;
  /** Phase1·Phase2 각각 `Promise.all` 벽시계 합(병렬 블록 총 대기) */
  direct_keys_parallel_wait_ms: number;
  direct_keys_cpu_ms: number;
  direct_keys_top_bottleneck: string;
  direct_keys_top_bottleneck_ms: number;
  direct_keys_top_bottleneck_percent: number;
  /** `tradePostCategoryId` 기준 슬롯 수(빈 id 제외) */
  direct_keys_category_ids_count: number;
  direct_keys_unique_category_ids_count: number;
  direct_keys_duplicate_category_ids_count: number;
  /** `trade_pc` direct key 슬롯 + `item_trade` room 슬롯 합(파싱 직후 배열 길이 기준) */
  direct_keys_bridge_ids_count: number;
  direct_keys_unique_bridge_ids_count: number;
  direct_keys_duplicate_bridge_ids_count: number;
  /** 직전 category ensure 에서 categories/trade_categories RTT 없음(모듈·요청 로더 적중) */
  direct_keys_category_cache_hit: boolean;
  /** legacy item_trade ledger 경로(RPC 또는 chat_rooms 폴백)가 짧은 TTL 스냅샷 적중 */
  direct_keys_bridge_cache_hit: boolean;
  /** `tradePostsFetchDetail.cacheHit` 스냅샷(해당 direct_keys 구간) */
  direct_keys_posts_row_cache_hit: boolean;
  direct_keys_posts_row_cache_miss: number;
  /** Phase1 bridge·product_chats(in id) 스냅샷 single-flight 합류 여부 */
  direct_keys_singleflight_hit: boolean;
  /** direct_keys orchestration 진단(perf 전용) */
  direct_keys_duplicate_merge_count?: number;
  direct_keys_map_rebuild_count?: number;
  direct_keys_duplicate_normalize_count?: number;
  direct_keys_bridge_attach_iterations?: number;
  direct_keys_category_attach_iterations?: number;
  direct_keys_object_spread_count?: number;
  direct_keys_hot_cpu_loop?: number;
  direct_keys_hidden_sequential_wait_ms?: number;
  direct_keys_lookup_rebuild_count?: number;
  direct_keys_apply_loop_ms?: number;
  direct_keys_lookup_rebuild_count_after?: number;
  direct_keys_map_rebuild_count_after?: number;
  direct_keys_cache_key?: string;
  direct_keys_normalized_cache_key?: string;
  direct_keys_cache_reason?: string;
  direct_keys_singleflight_key?: string;
  direct_keys_singleflight_join_count?: number;
  direct_keys_cache_ttl_ms?: number;
  direct_keys_cache_store_ms?: number;
  direct_keys_bridge_cache_hit_after?: boolean;
  direct_keys_category_cache_hit_after?: boolean;
  direct_keys_category_batch_singleflight_joins?: number;
  /** mega 번들: 맵 prune·캐시 키 해석 등 동기 구간(ms) — RPC·inflight 대기 제외 */
  direct_keys_mega_map_sync_ms?: number;
  /** mega 번들: inflight 합류 또는 RPC 리더 대기 벽시계 */
  direct_keys_mega_inflight_or_rpc_wait_ms?: number;
  /** mega row cache hit 또는 bundle inflight 합류 */
  direct_keys_lookup_reuse_hit?: boolean;
  /** `dedupeIds`+stable key 문자열 구축 CPU 근사 */
  direct_keys_key_build_cpu_ms?: number;
  /** mega 진입 직전 id 정규화·중복 제거 CPU 근사 */
  direct_keys_normalize_cpu_ms?: number;
  /** mega `direct_keys_mega_map_sync_ms` 와 동일 스케일의 동기 lookup CPU 별칭 */
  direct_keys_lookup_cpu_ms?: number;
};

export type HomeSyncDeepStepsTradePcBridgeBreakdown = {
  phaseBPcByRoomMs: number;
  phaseCLedgerMs: number;
  phaseCPcCandidatesMs: number;
  phaseDPairPcMs: number;
  /** Phase B `product_chats`(cm_room_id) 와 Phase C `chat_rooms`(ledger) RTT 를 Promise.all 로 겹친 경우 벽시계 */
  phaseBcLedgerParallelWallMs?: number;
};

/** dev: `buildTradeMessengerListContextMetaFromLoadedPost` 내부 CPU 분해(합산은 cpuMergeMs/phaseDFinalMergeCpuMs 에 이미 포함 — 이중 합산 금지) */
export type HomeSyncDeepStepsTradeMetaBuildFromPostDetail = {
  calls: number;
  productCategoryDisplayCpuMs: number;
  headlineCpuMs: number;
  categoryMenuLabelCpuMs: number;
  messengerSnapshotCpuMs: number;
};

/** dev 로그용 — `explainedComponentsMs` 합산의 조각(critical 기본 6항목). categoryFetchMs 등은 참고 필드로만. */
export type HomeSyncDeepStepsTradeMetaExplainedComponentsDetail = {
  directKeysWallMs: number;
  tradePcBridgeQueriesMs: number;
  seedProductChatsMs: number;
  tradePostsFetchMs: number;
  sellerProfileAttachMs: number;
  cpuMergeMs: number;
  /** seed 집합에 없던 pc id 보충 조회(Phase A) — 이전에는 미계측 */
  phaseASeedMissProductChatsMs?: number;
  /** Phase A: 시드 매칭·miss 행 병합·postIds dedupe 등 posts fetch 직전 동기( await 제외 ) */
  phaseAPrePostsSyncCpuMs?: number;
  /** Phase D: pair PC 쿼리 직후 ~ posts fetch 직전 동기(peer 맵·정렬·postIds 후보) */
  phaseDPeerIndexCpuMs?: number;
  /** Phase D: fetchPostsCached(postIdsPair)·category 병렬 이후 최종 contextMeta 병합 루프(전역 cpuMergeMs 에서 분리) */
  phaseDFinalMergeCpuMs?: number;
  /** Phase B: bridge `product_chats` 응답 → roomId 맵 동기 병합 */
  phaseBSyncMapCpuMs?: number;
  /** Phase C: ledger 응답 → roomId 맵 동기 병합 */
  phaseCSyncLedgerMapCpuMs?: number;
  /** Phase C: pcCandidates 응답 → triple→pc id 맵 동기 병합 */
  phaseCSyncPcTripleCpuMs?: number;
  /** fetchPostsCached 바깥: seed id 수집 + 각 Phase 진입용 filter/dedupe( 요청 스코프 전처리 ) */
  tradeEnrichPhaseTargetsPrepCpuMs?: number;
  /** 기본 explained 합산에는 포함하지 않음 — 로그 참고 */
  categoryFetchMsExcludedFromExplainedSum?: number;
  /** 기본 explained 합산에는 포함하지 않음 — full 에서 posts 상세 RTT 참고 */
  tradePostsQueryMsTotalExcludedFromExplainedSum?: number;
};

export type HomeSyncDeepStepsTradeMetaEnrich = {
  tradePostsFetchMs: number;
  tradePostsDetail?: HomeSyncDeepStepsTradePostsFetchDetail;
  categoryFetchMs: number;
  categoryDetail?: HomeSyncDeepStepsCategoryFetchDetail;
  sellerProfileAttachMs: number;
  sellerProfileAttach: HomeSyncDeepStepsSellerProfileAttachBreakdown;
  cpuMergeMs: number;
  totalMs: number;
  rooms: number;
  /** `enrichTradeRoomContextMetaForBootstrap` 에 전달된 카테고리 조회 모드(critical = fallback_only) */
  tradeCategoryFetchMode?: "full" | "fallback_only";
  /** 동일 trade 방 메타 재적용(merge pass) 횟수 — `[home-sync-full-analysis]` */
  duplicateTradeMergeCount?: number;
  /** true 이면 trade_categories/categories DB 조회를 스킵하고 포스트 필드 폴백만 사용 */
  categoryDbSkipped?: boolean;
  /** 요약 trade 방의 `productChatId` 묶음에 대한 seed `product_chats` 조회(Phase A·seller warm 공유, direct_keys 이후 1회) */
  seedProductChatsMs?: number;
  directKeys?: HomeSyncDeepStepsTradeDirectKeys;
  tradePcBridgeBreakdown?: HomeSyncDeepStepsTradePcBridgeBreakdown;
  tradePcBridgeQueriesMs?: number;
  /** dev: 우선 합산식(+ phase 타깃 전처리 + … + phaseD peer + phaseD final merge). categoryFetchMs 미포함 */
  explainedComponentsMs?: number;
  /** dev: explainedComponentsMs + categoryFetchMs — totalMs 와 2차 대조용(full tier) */
  explainedPlusCategoryParallelMs?: number;
  /** dev: totalMs − explainedPlusCategoryParallelMs — category 병렬 구간까지 포함한 잔차 */
  residualGapAfterCategoryMs?: number;
  /** dev: totalMs − explainedComponentsMs (미계측·중복·병렬 오차 탐지). 음수 가능 */
  gapMs?: number;
  explainedComponentsDetail?: HomeSyncDeepStepsTradeMetaExplainedComponentsDetail;
  /** home-sync / bootstrap 관측 — 응답 shape 불변 */
  tradeMetaCacheHit?: boolean;
  /** `tradeMetaCacheHit` 이 false 일 때만 의미 있는 짧은 이유 코드 */
  tradeMetaCacheMissReason?: string | null;
  /** 동일 요청 내 trade 요약 `id` 중복 행 수(입력 관측) */
  tradeMetaDuplicateRoomCount?: number;
  /** 동일 요청 내 trade `postId` 중복 개수(입력 관측) */
  tradeMetaDuplicatePostCount?: number;
  /** `sellerProfileAttach` 기준 trade 행 수 대비 고유 seller id 수 차이(근사, 0 이상) */
  tradeMetaDuplicateSellerCount?: number;
  /** Phase A(`phaseAParallelPromise`) + bridge/ledger 선행 `Promise.all` 벽시계 */
  tradeMetaParallelWaitMs?: number;
  /** posts + categories + trade_categories + bridge 보조(peer pair 시 +2) 누적 추정 */
  tradeMetaQueryCount?: number;
  /** trade enrich 전용 single-flight — 현재 미구현, false 예약 */
  tradeMetaSingleflightHit?: boolean;
  /** `direct_keys`·`seed_product_chats`·`category_fetch` 등 부분 중 최대 1축 */
  tradeMetaTopBottleneck?: string;
  tradeMetaTopBottleneckMs?: number;
};

export type HomeSyncDeepStepsTradePostsFetchDetail = {
  postIdsCount: number;
  postIdsDedupeCount: number;
  queryCount: number;
  cacheHit: boolean;
  usedSelect: string | null;
  selectColumnCount: number;
  fallbackAttemptCount: number;
  fallbackFailedCount: number;
  queryMsTotal: number;
  /** full tier: `TRADE_CHAT_LIST_POST_SELECT_CANDIDATES` 콜드 체인 벽시계(프로세스 resolved 1RTT·critical 경로 제외) */
  schemaColdDetectWallMs?: number;
};

/** dev: resolved posts select 경로에서 images 분리 조회·fat 폴백 횟수(요청 단위 누적) */
export type HomeSyncDeepStepsTradePostsResolvedSplit = {
  resolvedLightSelectCalls: number;
  resolvedImagesPatchCalls: number;
  resolvedFatFallbackCalls: number;
  patchPostIdsTotal: number;
  lightFetchPostIdsTotal: number;
};

export type HomeSyncDeepStepsCategoryFetchDetail = {
  categoryCacheHitCount: number;
  categoryCacheMissCount: number;
  tradeCategoryCacheHitCount: number;
  tradeCategoryCacheMissCount: number;
  categoriesQueryCount: number;
  tradeCategoriesQueryCount: number;
  categoriesIdsCount: number;
  tradeCategoriesIdsCount: number;
  selectFallbackAttemptCount: number;
  selectFallbackFailedCount: number;
  queryMsByTable: {
    categoriesMs: number;
    tradeCategoriesMs: number;
  };
  /** fetchMode 가 fallback_only 일 때 DB 카테고리 테이블을 조회하지 않음 */
  dbSkipped?: boolean;
  /** `categories`/`trade_categories` 배치 조회 singleflight 조인 횟수(요청 누적) */
  category_singleflight_join_count?: number;
  /** 조인 경로에서 스킵한 id 슬롯 수 근사(정렬·중복 제거 후 in 리스트 길이 합) */
  category_duplicate_fetch_count?: number;
  /** 마지막 배치의 진단 키(잘림) — 로그용 */
  category_cache_key?: string;
  /** 정렬·정규화된 in 키 — singleflight·모듈 캐시 키 스페이스와 정합 */
  normalized_category_cache_key?: string;
  category_singleflight_key?: string;
  /** `module_hit` | `db_leader` | `singleflight_join` | `mixed` 등 */
  category_cache_reason?: string;
  category_cache_lookup_ms?: number;
  category_cache_store_ms?: number;
  /** 요청 끝 관점: 마지막 ensure 구간에서 DB in(...) 없음 */
  category_cache_hit_after?: boolean;
  /** `tradePostCategoryId` 정렬·dedupe CPU (DB 직전) */
  category_normalize_cpu_ms?: number;
  /** 모듈 TTL·miss 집합 구축 벽시계(네트워크 제외) */
  category_lookup_wall_ms?: number;
  /** 마지막 배치에서 `fetchTable` singleflight 조인이 1회 이상 */
  category_singleflight_hit?: boolean;
  /** 배치 스냅샷 복구 또는 singleflight 조인으로 DB 왕복을 줄인 경우 */
  category_lookup_reuse_hit?: boolean;
  /** 동일 post 목록에서 중복된 category id 슬롯 수(스캔 − unique) */
  category_duplicate_attach_count?: number;
  /** 프로세스 모듈 TTL·배치 복구 후 hit 카운트가 1 이상 */
  category_process_cache_hit?: boolean;
  /** 로더 상태에서 이미 resolved 된 trade/legacy id 재스캔 스킵 발생 */
  category_request_local_hit?: boolean;
  category_request_local_trade_skips?: number;
  category_request_local_legacy_skips?: number;
  /** `categoriesMs`+`tradeCategoriesMs` — PostgREST in(...) 벽시계 합 */
  category_query_wall_ms?: number;
  /** 현재는 `category_query_wall_ms` 와 동일 합산(추후 분리 시 덮어씀) */
  category_postgrest_wait_ms?: number;
  category_network_wait_ms?: number;
  /** mergeRows + 배치 스냅샷 적용 CPU 근사 */
  category_attach_cpu_ms?: number;
  /** JSON/직렬화 미분리 시 0 */
  category_serialize_ms?: number;
  /** 모듈 TTL write 행 수·리더 SELECT·singleflight 조인 요약 */
  category_cache_store_reason?: string;
};

export type HomeSyncDeepStepsSellerProfileAttachBreakdown = {
  tradeRows: number;
  productChatIds: number;
  postIdsNeedingAuthor: number;
  sellerIds: number;
  sellerIdsDedupeMs: number;
  prefetchProductChatsMs: number;
  postsFetchMs: number;
  sellerProfilesFetchMs: number;
  attachCpuMs: number;
  totalMs: number;
  /**
   * 간접 추정: sellerProfilesFetchMs가 매우 작으면(예: <= 10ms) 캐시 hit 가능성이 높다.
   * (DB/네트워크 상황에 따라 오차 가능)
   */
  sellerProfilesFetchLikelyCached: boolean;
};

/** dev: `home-sync` 번들 — trade enrich 제외 구간 설명 (응답 shape 무관) */
export type HomeSyncDeepStepsBundleSteps = {
  bundleTotalMs: number;
  tradeMetaEnrichTotalMs: number;
  /** home-sync: `enrichTradeRoomContextMetaForBootstrap` 를 응답 전에 실행하지 않음 */
  tradeMetaDeferred?: boolean;
  /** bundle 벽시계 − trade enrich (RPC·프로필 hydrate·summarize·legacy unread 등) */
  outsideTradeEnrichMs: number;
  roomsFetchMs: number;
  /** critical: slice 상한 / full: 0 */
  roomSliceCpuMs: number;
  roomIdsDedupeMs: number;
  participantsProfilesMs: number;
  summarizeRoomsMs: number;
  unreadBadgeMs: number;
  payloadBuildMs: number;
  listSplitFilterMs: number;
  listMyChatsWallMs: number;
  /** `fetchMyRoomsPayload` round2 — `community_messenger_rooms` 행 select( last_message* 는 room 행 비정규화 컬럼) */
  roomsRound2RoomsDbFetchMs?: number;
  /** round1 room id 해상도(RPC·participant fallback·meta sort) */
  roomIdsResolutionMs?: number;
  /** round2 participants join */
  participantsJoinQueryMs?: number;
  /** round2 rooms base select */
  roomsBaseQueryMs?: number;
  /** round3 room_profiles 테이블 */
  roomMetaQueryMs?: number;
  roomRowsCount?: number;
  messageRowsCount?: number;
  /** critical in-process rooms payload TTL(2s) hit */
  homeSyncCriticalRoomsCacheHit?: number;
  /** critical: `hydrateProfilesLabelsOnly` ‖ `prefetchHs5LegacyUnreadRows` 벽시계 */
  homeSyncHs5HydrateUnreadParallelWallMs?: number;
  /** `getCommunityMessengerHomeSyncBundle` 내 Promise.all 벽시계(full) */
  bundleParallelWallMs?: number;
  friendsFetchMs?: number;
  friendsRequestsFetchMs?: number;
  /** in-process 5s TTL 캐시 히트 시 이전 miss 요청의 bundleSteps 일부를 재주입했음 */
  bundleReplayFromProcessCache?: boolean;
  /** 캐시 히트로 `listCommunityMessengerMyChatsAndGroups` 미실행 — 관측 전용 */
  bundleListRebuildSkipReason?: string;
  /** snapshot-first critical path — 1 RTT counter/RPC */
  homeSyncSnapshotPath?: number;
  homeSyncSnapshotVia?: "counter_row" | "unified_rpc";
  queryWave2Ms?: number;
  /** rate limit 직후 ~ bundle await 시작 */
  routePreBundleMs?: number;
  /** `requireAuthenticatedUserId` 벽시계(라우트 상단) */
  routeAuthWallMs?: number;
  /** 동일 cacheKey 로 이미 진행 중인 번들을 await 한 벽시계(첫 요청은 0에 가깝고, 합류 요청은 대기분) */
  homeSyncSingleflightJoinWaitMs?: number;
  /** `enforceRateLimit` 벽시계 */
  routeRateLimitWallMs?: number;
  /** `await getCommunityMessengerHomeSyncBundle` 벽시계(프로덕션 캐시 히트 시 0) */
  routeBundleAwaitMs?: number;
  /** dev 블록(JSON.stringify 등) */
  routeDevDiagnosticsMs?: number;
  routeTotalMs?: number;
  /** route 전체 − 번들 await (`routeBundleAwaitMs`) — 인증·rate limit·진단·응답 조립 근사 */
  routeHandlerMs?: number;
  /** 번들 await 제외 route 구간(인증·rate limit·진단·응답 직전까지 근사) */
  routeOutsideBundleAwaitMs?: number;
  /** `loadHomeSyncBundle` dynamic import 벽시계 — cold root-cause trace 전용 */
  routeBundleDynamicImportMs?: number;
  /** `enrichCommerceChatRoomLifecycleForList` 전체 벽시계 — cold root-cause trace 전용 */
  commerceLifecycleEnrichMs?: number;
  /** commerce lifecycle — `enrichTradeRoomLifecycleFieldsFromProductChats` */
  commerceLifecycleTradeMs?: number;
  /** commerce lifecycle — `enrichDeliveryRoomLifecycleFieldsFromStoreOrders` */
  commerceLifecycleDeliveryMs?: number;
};

/** dev: `listCommunityMessengerMyChatsAndGroups` unread·레거시 거래 unread 보강 구간 (응답 shape 무관) */
export type HomeSyncDeepStepsUnreadBadge = {
  /** `enrichMessengerTradeUnreadWithLegacyTrade` await 벽시계 — 서비스에서 설정 */
  unreadBadgeMs: number;
  /** HS5: 레거시 `chat_rooms`·`product_chats` 병렬 페치 구간 벽시계(구 직렬 합과 비교용) */
  unreadSourceFetchMs: number;
  legacyChatRoomsFetchMs: number;
  legacyProductChatsFetchMs: number;
  /** `summarizeRoomsBatchWithProfileMap` 안 참가자 `unread_count` → 요약 필드 반영 CPU 누적 */
  participantUnreadMs: number;
  /** 레거시 쿼리 응답 → 맵(itemTradeByCmRoomId, pcById) 구축 CPU */
  legacyTradeUnreadMs: number;
  /** 스토어 owner-hub 배지 API는 이 경로에서 호출하지 않음 — 계측용 0 고정 */
  ownerHubBadgeMs: number;
  /** 거래 방만 필터 + CM room id dedupe */
  roomIdDedupeMs: number;
  /** 최종 trade 요약 `unreadCount` 병합 루프 CPU */
  badgeAttachCpuMs: number;
  /** 같은 요청에서 `enrichMessengerTradeUnreadWithLegacyTrade` 가 2회 이상이면 1 이상 */
  unreadDuplicateFetchCount: number;
  /** HS5: `chat_rooms`·`product_chats` 레거시 소스 페치 병렬 구간 벽시계 */
  unreadParallelWallMs?: number;
  /**
   * HS5: 레거시 unread 소스 페치 유효 RTT 수(직렬 2 → 병렬 세그먼트 1).
   * PostgREST 동시 요청 2개이나 클라이언트 관점 벽시계는 단일 병렬 월로 합산한다.
   */
  unreadEffectiveRttCount?: number;
  /** Supabase/PostgREST 캐시는 미계측 — 항상 null */
  unreadCacheHit: boolean | null;
  /** critical HS5: hydrate 와 unread RPC prefetch 병렬 벽시계 */
  unreadHs5PrefetchParallelWithHydrateMs?: number;
  /** dev 전용: 이 요청에서 enrich 호출 횟수(home-sync trace 전달 시만 증가) */
  enrichInvocationCount?: number;
  /** HS5-RETRY: 거래 방 CM id 수 (dedupe 후) */
  unreadRoomIdsCount?: number;
  /** HS5-RETRY: productChatId 후보 수 (dedupe 후) */
  unreadProductChatIdsCount?: number;
  /** HS5-RETRY: DB 에서 가져온 chat_rooms + product_chats 행 수 합 */
  unreadRowsFetched?: number;
  /** HS5-RETRY: 요약에 unread 반영 루프 CPU */
  unreadAttachCpuMs?: number;
  /** HS5-RETRY: 행 → 맵 구축 CPU (item_trade 링크 맵 + pcById) */
  unreadMergeCpuMs?: number;
  /** HS5-RETRY: 레거시 소스 단일 왕복 중 최대 구간 ms (parallel 이면 두 쿼리 중 max, RPC 이면 bundle 벽시계) */
  unreadMaxSingleQueryMs?: number;
  /** HS5-RETRY: unreadMaxSingleQueryMs 에 해당하는 소스 라벨 */
  unreadSlowestQuery?: string;
  /** HS5-RETRY: 페이로드 크기 추정(바이트 근사, 관측 전용) */
  unreadPayloadBytesEstimate?: number;
  /** HS5-RETRY: DB 읽기 경로 — 단일 RPC 번들 vs 병렬 REST 폴백 */
  unreadLegacyFetchPath?: "rpc_bundle" | "parallel_rest";
  /** HS5-RETRY: `home_sync_hs5_unread_legacy_bundle` 단일 호출 벽시계 */
  unreadRpcBundleMs?: number;
  /** HS5-RPC-DEEP: RPC 본문 `_hs5RpcDebug.rpc_total_ms` (서버 함수 벽시계) */
  unreadRpcTotalMs?: number;
  unreadRpcChatRoomsMs?: number;
  unreadRpcProductChatsMs?: number;
  unreadRpcMergeMs?: number;
  unreadRpcJsonBuildMs?: number;
  /** HS5-RPC-DEEP: `_hs5RpcDebug` 행 수 합 */
  unreadRpcRowsFetched?: number;
  /** HS5-RPC-DEEP: 서버 행 수 기준 근사 바이트 */
  unreadRpcPayloadBytesEstimate?: number;
  /** HS5-RPC-DEEP: 클라 RPC 벽시계 − 서버 rpc_total_ms (PostgREST·네트워크 등) */
  unreadRpcNetworkOverheadMs?: number;
  /** 레거시 unread 소스 페치에 해당하는 DB 왕복 수(1=RPC bundle, 2=parallel REST 등) */
  unreadQueryCount?: number;
  /** 관측: 번들 재생·캐시 등으로 unread enrich 를 이 요청에서 다시 실행하지 않음 */
  unreadSkipReason?: string;

  /** `listCommunityMessengerMyChatsAndGroups` 전체 요약 행 수(home-sync unread 축 관측) */
  unreadBootstrapListRoomCount?: number;
  /** 목록 `id` 중복 행 수(원시 − unique) */
  unreadBootstrapListDuplicateIdRows?: number;
  /** HS5 직전 거래 맥락 요약 행 수 */
  unreadBootstrapTradeRoomRowsBeforeDedupe?: number;
  /** dedupe 후 CM room id 수 (= HS5 `p_cm_room_ids` 길이) */
  unreadBootstrapRoomCount?: number;
  /** `dedupeStrings` 로 제거된 중복 CM room id 개수 */
  unreadBootstrapDuplicateRooms?: number;
  /** HS5 네트워크 왕복 수(캐시·inflight 히트 시 0) */
  unreadBootstrapQueryCount?: number;
  /** HS5 행 TTL 캐시 히트(프로세스 내) */
  unreadBootstrapCacheHit?: 0 | 1;
  /** 캐시 미스 시 이유 — `ttl_expired` | `cold` | `inflight_join` | `rpc_error` 등 */
  unreadBootstrapCacheMissReason?: string;
  /** 캐시·스킵 적용 시(히트면 설명) */
  unreadBootstrapSkipReason?: string;
  /** 단독 COUNT(*) 경로 없음 — 0 고정 */
  unreadBootstrapCountQueryMs?: number;
  /** 레거시 소스 페치 벽시계(캐시 히트 0) */
  unreadBootstrapRowsFetchMs?: number;
  /** 맵 구축+attach CPU 합산 */
  unreadBootstrapCpuMergeMs?: number;
  /** 동일 fingerprint inflight 대기 벽시계 */
  unreadBootstrapParallelWaitMs?: number;
  /** rows fetch vs merge vs attach vs dedupe 중 최대 구간 라벨 */
  unreadBootstrapTopBottleneck?: string;
};

export type HomeSyncTrace = {
  token: string;
  /**
   * 라우트 진입 tier — `?tier=critical|full`.
   *
   * **critical 차단 권한**: `service.ts` 의 `fetchTradeChatListPostRowsByIds` 가 이 값을 보고
   * critical tier 에서는 schema fallback probing 을 **금지**한다(fixed select 1회만).
   * `token` 은 dev 에서만 채워지지만 `tier` 는 prod 도 포함하여 **항상** 채워야 한다.
   *
   * (필드 추가 사유: HS2 — 원인 1개 = posts fallback chain 6RTT 가 critical 에 그대로 살아있던 구조)
   */
  tier?: "critical" | "full";
  /** `requireAuthenticatedUserId()` wall time (route-level) */
  authSessionMs: number;
  deepSteps: {
    participantsProfiles?: HomeSyncDeepStepsParticipantsProfiles;
    tradeMetaEnrich?: HomeSyncDeepStepsTradeMetaEnrich;
    sellerProfileAttachBreakdown?: HomeSyncDeepStepsSellerProfileAttachBreakdown;
    categoryFetchDetail?: HomeSyncDeepStepsCategoryFetchDetail;
    tradePostsFetchDetail?: HomeSyncDeepStepsTradePostsFetchDetail;
    tradePostsResolvedSplit?: HomeSyncDeepStepsTradePostsResolvedSplit;
    tradeDirectKeysDetail?: HomeSyncDeepStepsTradeDirectKeys;
    /** `token: trade-chat-list-meta` — direct keys 단계 세부(HS3 mega vs legacy) */
    tradeDirectKeysListMetaBreakdown?: HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown;
    tradeMetaBuildFromPostDetail?: HomeSyncDeepStepsTradeMetaBuildFromPostDetail;
    /** route·번들·목록 단계가 순차 병합 — 로그 직전까지 부분 필드만 있어도 됨 */
    bundleSteps?: Partial<HomeSyncDeepStepsBundleSteps>;
    /** dev: unread 세분(참가자 unread CPU는 summarize, 레거시는 enrich 내부) */
    unreadHomeSyncSteps?: Partial<HomeSyncDeepStepsUnreadBadge>;
    /**
     * `POST trade-chat-list-meta` 전용 — `enrichTradeRoomContextMetaForBootstrap` 내부 **직렬 구간** 벽시계.
     * Phase B/C/D 안의 `categoryLoader.ensureForPosts` 는 해당 phase_ms 에 **포함**(중복 합산 금지).
     */
    tradeListMetaEnrichBootstrapBreakdown?: {
      enrich_direct_keys_ms: number;
      enrich_seed_product_chats_ms: number;
      /** `await Promise.all(phaseAParallelPromise, bridgeLedgerPromise, categoryParallelPrimePromise)` 벽시계 */
      enrich_phase_a_bridge_parallel_ms: number;
      /** 동일 벽시계 — 로그·대시보드 별칭 */
      enrich_parallel_wait_ms: number;
      enrich_phase_b_ms: number;
      enrich_phase_c_ms: number;
      enrich_phase_d_ms: number;
      /** `hydrateTradeListSellerDisplayNamesForSummaries` 전체 벽시계 */
      enrich_seller_display_hydrate_wall_ms: number;
      /** `fetchPostsCached` 누적(tradePostsFetchMs 변수와 동일 스케일) */
      enrich_load_post_ms: number;
      enrich_category_fetch_wall_ms: number;
      /** Phase D `product_chats` 쌍 조회(Promise.all 2쿼리) 벽시계 */
      enrich_partner_fetch_ms: number;
      /** `fetchSeedProductChatsForTradeEnrich` 시드 조회 벽시계(seedMsRef 와 동일 목적) */
      enrich_trade_state_ms: number;
      enrich_cpu_merge_tracked_ms: number;
      enrich_query_count_approx: number;
      /** 직렬 구간 합 대비 `tradeMetaEnrich.totalMs` 잔차(병렬·CPU·미계측) */
      enrich_gap_ms: number;
      enrich_top_bottleneck: string;
      enrich_top_bottleneck_ms: number;
      enrich_top_bottleneck_percent: number;
      /** 1 = direct_keys 만 적용 후 조기 반환(trade-chat-list-meta ultra-light) */
      trade_list_meta_ultra_light?: number;
      /** trade-chat-list-meta 오케스트레이션 — room 순회·병합 진단(응답 shape 무관) */
      orchestration_summaries_total?: number;
      orchestration_room_loop_count?: number;
      orchestration_duplicate_room_loop_count?: number;
      orchestration_merge_iteration_count?: number;
      orchestration_map_rebuild_count?: number;
      orchestration_phase_b_iterations?: number;
      orchestration_phase_c_iterations?: number;
      orchestration_phase_b_naive_summaries_scan?: number;
      orchestration_phase_c_naive_summaries_scan?: number;
      orchestration_phase_d_iterations?: number;
      orchestration_phase_transition_wait_ms?: number;
      orchestration_direct_keys_merge_ms?: number;
      orchestration_patch_merge_ms?: number;
      orchestration_summary_merge_ms?: number;
      orchestration_trade_state_merge_ms?: number;
      orchestration_duplicate_normalize_count?: number;
      orchestration_cpu_hot_loop?: number;
      orchestration_room_loop_count_after?: number;
      orchestration_duplicate_room_loop_count_after?: number;
      orchestration_map_rebuild_count_after?: number;
      orchestration_phase_b_naive_summaries_scan_after?: number;
      orchestration_phase_c_naive_summaries_scan_after?: number;
      orchestration_phase_transition_wait_ms_after?: number;
      /** Phase B/C/D 각각에서 실제 메타 쓰기가 있었으면 1(최대 3) */
      orchestration_attach_pass_count?: number;
      /** B+C 를 동일「파동」으로 묶은 뒤의 파동 수(최대 2: hydrate + D) */
      orchestration_attach_pass_count_after?: number;
      /** 유효 할당 루프 합(B+C+D) — 순회 스캔 길이 대비 */
      orchestration_summary_scan_after?: number;
      orchestration_duplicate_loop_after?: number;
      orchestration_parallel_wait_after?: number;
      orchestration_attach_merge_ms?: number;
      orchestration_lookup_reuse_hit?: boolean;
      /** `Promise.all(phaseA, bridge, categoryPrime)` 의존 수 — category prime 비활성 시 2 */
      enrich_parallel_dependency_count?: number;
      /** 병렬 블록에서 지배적 대기 원인 라벨(관측) */
      enrich_parallel_blocking_group?: string;
      /** Phase A+bridge 와 겹친 category prime(`ensureForPosts`) 벽시계 */
      enrich_category_prime_parallel_ms?: number;
      enrich_parallel_blocking_group_after?: string;
      enrich_parallel_wait_after?: number;
      enrich_dependency_count_after?: number;
      enrich_attach_network_wait_ms?: number;
      enrich_attach_cpu_ms?: number;
    };
    /** `token: trade-chat-list-meta` — seller hydrate·`fetchProfilesByIds` row cache·single-flight 관측 */
    tradeListMetaProfileHydrateStats?: {
      trade_meta_profile_ids_count: number;
      trade_meta_unique_profile_ids_count: number;
      trade_meta_duplicate_profile_ids_count: number;
      trade_meta_seller_ids_count: number;
      trade_meta_unique_seller_ids_count: number;
      trade_meta_profile_cache_hit: boolean;
      trade_meta_seller_cache_hit: boolean;
      trade_meta_profiles_fetch_row_cache_hits: number;
      trade_meta_profiles_fetch_row_cache_misses: number;
      trade_meta_profile_fetch_singleflight_hit: boolean;
      trade_meta_profiles_fetch_top_bottleneck: string;
      trade_meta_seller_hydrate_top_bottleneck: string;
    };
  };
};

export function ms(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/**
 * home-sync 서버 계측: `token` 비어 있어도 `tier` 가 critical/full 이면 deepSteps 를 채운다.
 * (과거 prod critical 에서 `token: ""` 로 `trace?.token` 분기만 꺼지던 불일치 방지)
 */
export function homeSyncTraceMeterEnabled(trace: HomeSyncTrace | undefined | null): boolean {
  if (!trace) return false;
  return trace.tier === "critical" || trace.tier === "full";
}

/**
 * 동일 `cacheKey` single-flight 합류 요청이 리더와 **다른 trace 인스턴스**를 쓸 때,
 * 번들 계측은 리더 trace에만 쌓이므로 합류자 trace에 `deepSteps` 를 복제한다.
 * (리더·합류자 각각의 라우트 상단 `route*` ms 는 합류자 쪽 값을 유지)
 */
export function mergeHomeSyncDeepStepsAfterSingleflightJoin(
  joiner: HomeSyncTrace,
  leader: HomeSyncTrace,
  joinBundleAwaitMs: number
): void {
  if (!homeSyncTraceMeterEnabled(joiner) || !homeSyncTraceMeterEnabled(leader)) return;
  const preserved = {
    routeAuthWallMs: joiner.deepSteps.bundleSteps?.routeAuthWallMs,
    routeRateLimitWallMs: joiner.deepSteps.bundleSteps?.routeRateLimitWallMs,
    routePreBundleMs: joiner.deepSteps.bundleSteps?.routePreBundleMs,
  };
  joiner.deepSteps = structuredClone(leader.deepSteps);
  joiner.deepSteps.bundleSteps = {
    ...(joiner.deepSteps.bundleSteps ?? {}),
    ...preserved,
    homeSyncSingleflightJoinWaitMs: ms(joinBundleAwaitMs),
    routeBundleAwaitMs: ms(joinBundleAwaitMs),
  };
}

export function bumpTradePostsResolvedSplitStats(
  trace: HomeSyncTrace | undefined,
  delta: Partial<HomeSyncDeepStepsTradePostsResolvedSplit>
): void {
  if (!homeSyncTraceMeterEnabled(trace)) return;
  const t = trace!;
  const prev = t.deepSteps.tradePostsResolvedSplit ?? {
    resolvedLightSelectCalls: 0,
    resolvedImagesPatchCalls: 0,
    resolvedFatFallbackCalls: 0,
    patchPostIdsTotal: 0,
    lightFetchPostIdsTotal: 0,
  };
  t.deepSteps.tradePostsResolvedSplit = {
    resolvedLightSelectCalls: prev.resolvedLightSelectCalls + (delta.resolvedLightSelectCalls ?? 0),
    resolvedImagesPatchCalls: prev.resolvedImagesPatchCalls + (delta.resolvedImagesPatchCalls ?? 0),
    resolvedFatFallbackCalls: prev.resolvedFatFallbackCalls + (delta.resolvedFatFallbackCalls ?? 0),
    patchPostIdsTotal: prev.patchPostIdsTotal + (delta.patchPostIdsTotal ?? 0),
    lightFetchPostIdsTotal: prev.lightFetchPostIdsTotal + (delta.lightFetchPostIdsTotal ?? 0),
  };
}

function pushStepMs(out: Record<string, number>, key: string, value: unknown): void {
  const n = ms(value);
  if (n > 0) out[key] = n;
}

const HOME_SYNC_OUTSIDE_TRADE_STEP_KEYS: Array<keyof HomeSyncDeepStepsBundleSteps> = [
  "roomsFetchMs",
  "roomSliceCpuMs",
  "roomIdsDedupeMs",
  "participantsProfilesMs",
  "summarizeRoomsMs",
  "unreadBadgeMs",
  "listSplitFilterMs",
];

/**
 * dev critical home-sync: `tradeMetaEnrich.totalMs` 안쪽 단계 ms 평탄화 + 병목 1개(`topTradeMetaBottleneck`).
 * 응답·동작 없음 — 로그 전용.
 */
export function buildHomeSyncTradeMetaStepBreakdown(
  trade: HomeSyncDeepStepsTradeMetaEnrich | undefined,
  tradeMetaBuildFromPostDetail: HomeSyncDeepStepsTradeMetaBuildFromPostDetail | undefined
): {
  tradeMetaEnrichTotalMs: number;
  steps: Record<string, number>;
  topTradeMetaBottleneck: { key: string; ms: number } | null;
} {
  const steps: Record<string, number> = {};
  if (!trade) {
    return { tradeMetaEnrichTotalMs: 0, steps, topTradeMetaBottleneck: null };
  }

  pushStepMs(steps, "tradeMetaEnrichTotalMs", trade.totalMs);
  pushStepMs(steps, "categoryFetchMs", trade.categoryFetchMs);
  pushStepMs(steps, "tradePostsFetchMs", trade.tradePostsFetchMs);
  pushStepMs(steps, "sellerProfileAttachMs", trade.sellerProfileAttachMs);
  pushStepMs(steps, "cpuMergeMs", trade.cpuMergeMs);
  pushStepMs(steps, "seedProductChatsMs", trade.seedProductChatsMs);
  pushStepMs(steps, "tradePcBridgeQueriesMs", trade.tradePcBridgeQueriesMs);
  pushStepMs(steps, "explainedComponentsMs", trade.explainedComponentsMs);
  pushStepMs(steps, "explainedPlusCategoryParallelMs", trade.explainedPlusCategoryParallelMs);

  const dk = trade.directKeys;
  if (dk) {
    pushStepMs(steps, "directKeys_wallMs", dk.wallMs);
    pushStepMs(steps, "directKeys_pcFromKeyQueryMs", dk.pcFromKeyQueryMs);
    pushStepMs(steps, "directKeys_chatRoomsQueryMs", dk.chatRoomsQueryMs);
    pushStepMs(steps, "directKeys_pcCandidatesQueryMs", dk.pcCandidatesQueryMs);
    pushStepMs(steps, "directKeys_postsFetchMs", dk.postsFetchMs);
    pushStepMs(steps, "directKeys_categoryEnsureMs", dk.categoryEnsureMs);
    pushStepMs(steps, "directKeys_itemTradeLedgerBundleRpcMs", dk.itemTradeLedgerBundleRpcMs);
    pushStepMs(steps, "directKeys_bundleRpcMs", dk.bundleRpcMs);
    pushStepMs(steps, "directKeys_phase1WallMs", dk.phase1WallMs);
    pushStepMs(steps, "directKeys_phase2WallMs", dk.phase2WallMs);
    pushStepMs(steps, "directKeys_postsStartAfterMs", dk.postsStartAfterMs);
    pushStepMs(steps, "directKeys_pcCandidatesStartAfterMs", dk.pcCandidatesStartAfterMs);
    pushStepMs(steps, "directKeys_categoryAfterPostsMs", dk.categoryAfterPostsMs);
    pushStepMs(steps, "directKeys_effectiveParallelGainMs", dk.effectiveParallelGainMs);
    if (dk.effectiveRttCount != null && dk.effectiveRttCount > 0) {
      steps["directKeys_effectiveRttCount"] = dk.effectiveRttCount;
    }
    if (dk.parallelEfficiencyMs != null && ms(dk.parallelEfficiencyMs) > 0) {
      pushStepMs(steps, "directKeys_parallelEfficiencyMs", dk.parallelEfficiencyMs);
    }
  }

  const br = trade.tradePcBridgeBreakdown;
  if (br) {
    pushStepMs(steps, "tradePcBridge_phaseBcLedgerParallelWallMs", br.phaseBcLedgerParallelWallMs);
    pushStepMs(steps, "tradePcBridge_phaseBPcByRoomMs", br.phaseBPcByRoomMs);
    pushStepMs(steps, "tradePcBridge_phaseCLedgerMs", br.phaseCLedgerMs);
    pushStepMs(steps, "tradePcBridge_phaseCPcCandidatesMs", br.phaseCPcCandidatesMs);
    pushStepMs(steps, "tradePcBridge_phaseDPairPcMs", br.phaseDPairPcMs);
  }

  const ex = trade.explainedComponentsDetail;
  if (ex) {
    pushStepMs(steps, "explained_directKeysWallMs", ex.directKeysWallMs);
    pushStepMs(steps, "explained_tradePcBridgeQueriesMs", ex.tradePcBridgeQueriesMs);
    pushStepMs(steps, "explained_seedProductChatsMs", ex.seedProductChatsMs);
    pushStepMs(steps, "explained_tradePostsFetchMs", ex.tradePostsFetchMs);
    pushStepMs(steps, "explained_sellerProfileAttachMs", ex.sellerProfileAttachMs);
    pushStepMs(steps, "explained_cpuMergeMs", ex.cpuMergeMs);
    pushStepMs(steps, "explained_phaseASeedMissProductChatsMs", ex.phaseASeedMissProductChatsMs);
    pushStepMs(steps, "explained_phaseDPeerIndexCpuMs", ex.phaseDPeerIndexCpuMs);
    pushStepMs(steps, "explained_phaseBSyncMapCpuMs", ex.phaseBSyncMapCpuMs);
    pushStepMs(steps, "explained_phaseCSyncLedgerMapCpuMs", ex.phaseCSyncLedgerMapCpuMs);
    pushStepMs(steps, "explained_phaseCSyncPcTripleCpuMs", ex.phaseCSyncPcTripleCpuMs);
    pushStepMs(steps, "explained_phaseAPrePostsSyncCpuMs", ex.phaseAPrePostsSyncCpuMs);
    pushStepMs(steps, "explained_tradeEnrichPhaseTargetsPrepCpuMs", ex.tradeEnrichPhaseTargetsPrepCpuMs);
    pushStepMs(steps, "explained_phaseDFinalMergeCpuMs", ex.phaseDFinalMergeCpuMs);
  }

  pushStepMs(steps, "residualGapAfterCategoryMs", trade.residualGapAfterCategoryMs);
  pushStepMs(steps, "gapMs", trade.gapMs);

  const tpd = trade.tradePostsDetail;
  if (tpd) {
    pushStepMs(steps, "tradePosts_queryMsTotal", tpd.queryMsTotal);
  }

  const sa = trade.sellerProfileAttach;
  if (sa) {
    pushStepMs(steps, "sellerAttach_prefetchProductChatsMs", sa.prefetchProductChatsMs);
    pushStepMs(steps, "sellerAttach_postsFetchMs", sa.postsFetchMs);
    pushStepMs(steps, "sellerAttach_sellerProfilesFetchMs", sa.sellerProfilesFetchMs);
    pushStepMs(steps, "sellerAttach_attachCpuMs", sa.attachCpuMs);
    pushStepMs(steps, "sellerAttach_sellerIdsDedupeMs", sa.sellerIdsDedupeMs);
    pushStepMs(steps, "sellerAttach_totalMs", sa.totalMs);
  }

  if (tradeMetaBuildFromPostDetail) {
    pushStepMs(steps, "buildFromPost_productCategoryDisplayCpuMs", tradeMetaBuildFromPostDetail.productCategoryDisplayCpuMs);
    pushStepMs(steps, "buildFromPost_messengerSnapshotCpuMs", tradeMetaBuildFromPostDetail.messengerSnapshotCpuMs);
    pushStepMs(steps, "buildFromPost_categoryMenuLabelCpuMs", tradeMetaBuildFromPostDetail.categoryMenuLabelCpuMs);
    pushStepMs(steps, "buildFromPost_headlineCpuMs", tradeMetaBuildFromPostDetail.headlineCpuMs);
  }

  const bottle: Array<[string, number]> = [];
  const addB = (key: string, v: unknown) => {
    const n = ms(v);
    if (n > 0) bottle.push([key, n]);
  };

  addB("categoryFetchMs", trade.categoryFetchMs);
  addB("tradePostsFetchMs", trade.tradePostsFetchMs);
  addB("cpuMergeMs", trade.cpuMergeMs);
  addB("seedProductChatsMs", trade.seedProductChatsMs);
  if (dk) addB("directKeys_wallMs", dk.wallMs);

  const brk = trade.tradePcBridgeBreakdown;
  const parallelWall = brk?.phaseBcLedgerParallelWallMs;
  const bridgeLeafSum =
    brk != null
      ? (parallelWall != null && ms(parallelWall) > 0
          ? ms(parallelWall)
          : ms(brk.phaseBPcByRoomMs) + ms(brk.phaseCLedgerMs)) +
        ms(brk.phaseCPcCandidatesMs) +
        ms(brk.phaseDPairPcMs)
      : 0;
  if (brk && bridgeLeafSum > 0) {
    if (parallelWall != null && ms(parallelWall) > 0) {
      addB("tradePcBridge_phaseBcLedgerParallelWallMs", parallelWall);
    }
    addB("tradePcBridge_phaseBPcByRoomMs", brk.phaseBPcByRoomMs);
    addB("tradePcBridge_phaseCLedgerMs", brk.phaseCLedgerMs);
    addB("tradePcBridge_phaseCPcCandidatesMs", brk.phaseCPcCandidatesMs);
    addB("tradePcBridge_phaseDPairPcMs", brk.phaseDPairPcMs);
  } else {
    addB("tradePcBridgeQueriesMs", trade.tradePcBridgeQueriesMs);
  }

  if (sa) {
    addB("sellerAttach_prefetchProductChatsMs", sa.prefetchProductChatsMs);
    addB("sellerAttach_postsFetchMs", sa.postsFetchMs);
    addB("sellerAttach_sellerProfilesFetchMs", sa.sellerProfilesFetchMs);
    addB("sellerAttach_attachCpuMs", sa.attachCpuMs);
    addB("sellerAttach_sellerIdsDedupeMs", sa.sellerIdsDedupeMs);
    const sellerLeaves =
      ms(sa.prefetchProductChatsMs) +
      ms(sa.postsFetchMs) +
      ms(sa.sellerProfilesFetchMs) +
      ms(sa.attachCpuMs) +
      ms(sa.sellerIdsDedupeMs);
    if (sellerLeaves === 0) addB("sellerProfileAttachMs", trade.sellerProfileAttachMs);
  } else {
    addB("sellerProfileAttachMs", trade.sellerProfileAttachMs);
  }

  addB("residualGapAfterCategoryMs", trade.residualGapAfterCategoryMs);
  addB("gapMs", trade.gapMs);

  const exd = trade.explainedComponentsDetail;
  if (exd) {
    addB("explained_phaseASeedMissProductChatsMs", exd.phaseASeedMissProductChatsMs);
    addB("explained_phaseDPeerIndexCpuMs", exd.phaseDPeerIndexCpuMs);
    addB("explained_phaseBSyncMapCpuMs", exd.phaseBSyncMapCpuMs);
    addB("explained_phaseCSyncLedgerMapCpuMs", exd.phaseCSyncLedgerMapCpuMs);
    addB("explained_phaseCSyncPcTripleCpuMs", exd.phaseCSyncPcTripleCpuMs);
    addB("explained_phaseAPrePostsSyncCpuMs", exd.phaseAPrePostsSyncCpuMs);
    addB("explained_tradeEnrichPhaseTargetsPrepCpuMs", exd.tradeEnrichPhaseTargetsPrepCpuMs);
    addB("explained_phaseDFinalMergeCpuMs", exd.phaseDFinalMergeCpuMs);
  }

  if (tradeMetaBuildFromPostDetail) {
    addB("buildFromPost_messengerSnapshotCpuMs", tradeMetaBuildFromPostDetail.messengerSnapshotCpuMs);
    addB("buildFromPost_categoryMenuLabelCpuMs", tradeMetaBuildFromPostDetail.categoryMenuLabelCpuMs);
    addB("buildFromPost_headlineCpuMs", tradeMetaBuildFromPostDetail.headlineCpuMs);
    addB("buildFromPost_productCategoryDisplayCpuMs", tradeMetaBuildFromPostDetail.productCategoryDisplayCpuMs);
  }

  addB("tradePosts_queryMsTotal", trade.tradePostsDetail?.queryMsTotal);

  let topTradeMetaBottleneck: { key: string; ms: number } | null = null;
  for (const [k, v] of bottle) {
    if (!topTradeMetaBottleneck || v > topTradeMetaBottleneck.ms) topTradeMetaBottleneck = { key: k, ms: v };
  }

  return {
    tradeMetaEnrichTotalMs: ms(trade.totalMs),
    steps,
    topTradeMetaBottleneck: topTradeMetaBottleneck && topTradeMetaBottleneck.ms > 0 ? topTradeMetaBottleneck : null,
  };
}

/**
 * dev: `outsideTradeEnrichMs`(번들 벽시계 − trade enrich) 대비 순차 구간 계측 요약.
 * `payloadBuildMs`는 CPU 합성이라 합산·병목 후보에서 제외하고 참고만 표시.
 */
export function buildHomeSyncOutsideTradeStepBreakdown(bs: Partial<HomeSyncDeepStepsBundleSteps>): {
  outsideTradeEnrichMs: number;
  steps: Record<string, number>;
  sumListedOutsideStepsMs: number;
  outsideRollupVsSumDeltaMs: number;
  topOutsideTradeEnrichBottleneck: { key: string; ms: number } | null;
} {
  const steps: Record<string, number> = {};
  for (const k of HOME_SYNC_OUTSIDE_TRADE_STEP_KEYS) {
    pushStepMs(steps, k as string, bs[k]);
  }
  pushStepMs(steps, "payloadBuildMs", bs.payloadBuildMs);

  let sumListedOutsideStepsMs = 0;
  const bottle: Array<[string, number]> = [];
  for (const k of HOME_SYNC_OUTSIDE_TRADE_STEP_KEYS) {
    const n = ms(bs[k]);
    sumListedOutsideStepsMs += n;
    if (n > 0) bottle.push([k as string, n]);
  }

  const rollup = ms(bs.outsideTradeEnrichMs);

  let topOutsideTradeEnrichBottleneck: { key: string; ms: number } | null = null;
  for (const [k, v] of bottle) {
    if (!topOutsideTradeEnrichBottleneck || v > topOutsideTradeEnrichBottleneck.ms) {
      topOutsideTradeEnrichBottleneck = { key: k, ms: v };
    }
  }

  return {
    outsideTradeEnrichMs: rollup,
    steps,
    sumListedOutsideStepsMs: ms(sumListedOutsideStepsMs),
    outsideRollupVsSumDeltaMs: ms(rollup - sumListedOutsideStepsMs),
    topOutsideTradeEnrichBottleneck:
      topOutsideTradeEnrichBottleneck && topOutsideTradeEnrichBottleneck.ms > 0
        ? topOutsideTradeEnrichBottleneck
        : null,
  };
}

