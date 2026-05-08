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

export type HomeSyncTrace = {
  token: string;
  /** `requireAuthenticatedUserId()` wall time (route-level) */
  authSessionMs: number;
  deepSteps: {
    participantsProfiles?: HomeSyncDeepStepsParticipantsProfiles;
    tradeMetaEnrich?: HomeSyncDeepStepsTradeMetaEnrich;
    sellerProfileAttachBreakdown?: HomeSyncDeepStepsSellerProfileAttachBreakdown;
    categoryFetchDetail?: HomeSyncDeepStepsCategoryFetchDetail;
    tradePostsFetchDetail?: HomeSyncDeepStepsTradePostsFetchDetail;
  };
};

export function ms(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

