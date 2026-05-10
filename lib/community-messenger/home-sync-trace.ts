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
  /** `getCommunityMessengerHomeSyncBundle` 내 Promise.all 벽시계(full) */
  bundleParallelWallMs?: number;
  friendsFetchMs?: number;
  friendsRequestsFetchMs?: number;
  /** rate limit 직후 ~ bundle await 시작 */
  routePreBundleMs?: number;
  /** `await getCommunityMessengerHomeSyncBundle` 벽시계(프로덕션 캐시 히트 시 0) */
  routeBundleAwaitMs?: number;
  /** dev 블록(JSON.stringify 등) */
  routeDevDiagnosticsMs?: number;
  routeTotalMs?: number;
  /** route 전체 − 번들 await (`routeBundleAwaitMs`) — 인증·rate limit·진단·응답 조립 근사 */
  routeHandlerMs?: number;
  /** 번들 await 제외 route 구간(인증·rate limit·진단·응답 직전까지 근사) */
  routeOutsideBundleAwaitMs?: number;
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
    tradeMetaBuildFromPostDetail?: HomeSyncDeepStepsTradeMetaBuildFromPostDetail;
    /** route·번들·목록 단계가 순차 병합 — 로그 직전까지 부분 필드만 있어도 됨 */
    bundleSteps?: Partial<HomeSyncDeepStepsBundleSteps>;
    /** dev: unread 세분(참가자 unread CPU는 summarize, 레거시는 enrich 내부) */
    unreadHomeSyncSteps?: Partial<HomeSyncDeepStepsUnreadBadge>;
  };
};

export function ms(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function bumpTradePostsResolvedSplitStats(
  trace: HomeSyncTrace | undefined,
  delta: Partial<HomeSyncDeepStepsTradePostsResolvedSplit>
): void {
  if (!trace?.token) return;
  const prev = trace.deepSteps.tradePostsResolvedSplit ?? {
    resolvedLightSelectCalls: 0,
    resolvedImagesPatchCalls: 0,
    resolvedFatFallbackCalls: 0,
    patchPostIdsTotal: 0,
    lightFetchPostIdsTotal: 0,
  };
  trace.deepSteps.tradePostsResolvedSplit = {
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

