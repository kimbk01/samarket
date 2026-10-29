/**
 * SB1 stores browse snapshot — read path (counter row → unified RPC → assemble).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  earlyBrowseBodyFromRpcPayload,
  parseStoresBrowseSnapshotRpcData,
  storesBrowseDbBundleFromRpcPayload,
  type StoresBrowseEarlyBody,
  type StoresBrowseSnapshotPayloadJson,
} from "@/lib/stores/stores-browse-snapshot-assemble";
import {
  STORES_BROWSE_SNAPSHOT_FETCH_CAP,
  STORES_BROWSE_SNAPSHOT_RPC,
  STORES_BROWSE_SNAPSHOT_SINGLE_FLIGHT_PREFIX,
  STORES_BROWSE_SNAPSHOT_TABLE,
  storesBrowseSnapshotBundleKeyParts,
  storesBrowseSnapshotCounterTtlMs,
} from "@/lib/stores/stores-browse-snapshot-counter";
import {
  logStoresBrowseMonolithAnalysis,
  logStoresBrowseSnapshotRpcDesignOnce,
} from "@/lib/stores/stores-browse-snapshot-hotpath-analysis";
import {
  evaluateStoresBrowseRegressionGuards,
  type StoresBrowseSnapshotBreakdown,
} from "@/lib/stores/stores-browse-snapshot-regression-guard";
import { attachStoresBrowseInsertionMeta } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import {
  refreshStoresBrowseSnapshotKey,
  scheduleStoresBrowseSnapshotRefresh,
} from "@/lib/stores/stores-browse-snapshot-refresh";
import type { StoresBrowseScopeCustomerMeta } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import { enrichBrowseStoresWithPlatformPopular } from "@/lib/stores/enrich-browse-stores-platform-popular";
import {
  assembleStoresBrowseResponse,
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  resolveBrowseFilteredSortedStoreRows,
  applyBrowseSubFilterContractToPrefetchedFilter,
  applyNewAuthorityFastPrepSortToBrowseFilter,
  applyNewAuthorityDistanceSortToBrowseFilter,
  applyNewAuthorityRatingConfidenceToBrowseFilter,
  applyPopularityWindowOverlayToBrowseFilter,
  resolveBrowseFilteredStoreRows,
  type StoreBrowseRow,
  type StoresBrowseAssembleResult,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";
import { loadBrowseDiscoveryCandidateRows, selectBrowseStoreRowsForRanking } from "@/lib/stores/store-discovery-candidate";
import { loadBrowseDiscoveryRankedForLive } from "@/lib/stores/discovery/load-store-discovery-ranked-live";
import {
  isStoreDiscoveryRankingAuthorityNew,
  logStoreDiscoveryAuthorityRuntime,
  resolveStoreDiscoveryRankingAuthority,
} from "@/lib/stores/discovery/store-discovery-ranking-authority";
import { buildStoreDiscoveryBrowseExposureScope } from "@/lib/stores/store-discovery-exposure";
import { loadStoreCompletedOrderCount30dMapWithStatus, resolveStorePopularitySinceIso } from "@/lib/stores/store-discovery-popular-store";
import { loadStoreRatingConfidencePolicy } from "@/lib/stores/store-rating-confidence-policy";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import {
  loadStoreServiceAreaRuntimeMap,
  type StoreServiceAreaRuntimeSlice,
} from "@/lib/delivery/service-area/load-store-service-area-runtime-map";
import { countSupabaseRoundTrips } from "@/lib/stores/supabase-round-trip-counter";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = STORES_BROWSE_SNAPSHOT_SINGLE_FLIGHT_PREFIX;
const ROUTE = "/api/stores/browse";

type SnapshotReadVia = "counter_row" | "unified_rpc";

export type StoresBrowseSnapshotLoadOptions = {
  /** `?fresh=1&storesBrowseBypass=1` 전용 — 저장 행을 건너뛰고 원본 RPC */
  bypassCounter?: boolean;
  /** 5-C BR-02 — 같은 요청에서 라우트가 이미 계산한 (ctx.primary, ctx.sub) 고객 메타 (삽입 메타 정책 재조회 제거) */
  scopeMeta?: StoresBrowseScopeCustomerMeta | null;
  /**
   * `discovery_shelf` — 탐색 선반 소스용 내부 조회: 매장 행(순위·적격)만 필요하므로
   * 삽입 메타(광고·쿠폰 배지)와 플랫폼 인기 메뉴 보강을 계산하지 않는다.
   */
  purpose?: "list" | "discovery_shelf";
};

/** 5-C BR-01 — 오래된 저장 행이 실시간 순위 매장을 담지 못함 → 원본 RPC 로 다시 읽어야 함 */
type StaleSnapshotMismatch = { staleMismatch: true; missingStoreIds: string[] };

type SnapshotRow = {
  payload_json: StoresBrowseSnapshotPayloadJson;
  updated_at: string;
};

export type StoresBrowseSnapshotReadResult = {
  body: StoresBrowseAssembleResult["body"] | StoresBrowseEarlyBody;
  breakdown: StoresBrowseSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
  rpcWallMs: number;
  transformMs: number;
  dbBaseMs: number;
  dbRelatedMs: number;
  resultCount: number;
  queryCount: number;
  v2: {
    base_query_ms: number;
    category_query_ms: number;
    product_preview_query_ms: number;
    review_summary_query_ms: number;
    distance_sort_ms: number;
    query_count: number;
    selected_columns: string;
  };
  early?: boolean;
};

function counterSelectFields(): string {
  return [
    "primary_slug",
    "sub_slug",
    "region",
    "city",
    "district",
    "geo_part",
    "list_limit",
    "ui_lang",
    "list_scope",
    "cursor_key",
    "payload_json",
    "updated_at",
  ].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    payload_json: payload as StoresBrowseSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof storesBrowseSnapshotBundleKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(STORES_BROWSE_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("primary_slug", keys.primary_slug)
    .eq("sub_slug", keys.sub_slug)
    .eq("region", keys.region)
    .eq("city", keys.city)
    .eq("district", keys.district)
    .eq("geo_part", keys.geo_part)
    .eq("list_limit", keys.list_limit)
    .eq("ui_lang", keys.ui_lang)
    .eq("list_scope", keys.list_scope)
    .eq("cursor_key", keys.cursor_key)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payload_json") || error.code === "42703") return { hit: false, reason: "no_column" };
    if (msg.includes("does not exist") || error.code === "42P01") return { hit: false, reason: "missing" };
    return { hit: false, reason: "error" };
  }
  const row = data ? rowFromDb(data as unknown as Record<string, unknown>) : null;
  if (!row) return { hit: false, reason: "missing" };
  const ageMs = Math.max(0, Date.now() - new Date(row.updated_at).getTime());
  return { hit: true, row, ageMs, stale: ageMs > storesBrowseSnapshotCounterTtlMs() };
}

/**
 * v4 DB-05 — 「없는 업종/주제」(unknown_primary · unknown_topic) 판정은 저장하지 않는다.
 * 임의 slug 요청마다 스냅샷 행이 늘어나는 것을 막는다 (응답은 RPC 결과로 그대로 조립 — 동작 불변).
 */
export function shouldPersistStoresBrowseSnapshotPayload(payload: StoresBrowseSnapshotPayloadJson): boolean {
  return !(payload.unknown_primary || payload.unknown_topic);
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof storesBrowseSnapshotBundleKeyParts>,
  payload: StoresBrowseSnapshotPayloadJson
): Promise<void> {
  if (!shouldPersistStoresBrowseSnapshotPayload(payload)) return;
  const { error } = await sbAny.from(STORES_BROWSE_SNAPSHOT_TABLE).upsert(
    {
      primary_slug: keys.primary_slug,
      sub_slug: keys.sub_slug,
      region: keys.region,
      city: keys.city,
      district: keys.district,
      geo_part: keys.geo_part,
      list_limit: keys.list_limit,
      ui_lang: keys.ui_lang,
      list_scope: keys.list_scope,
      cursor_key: keys.cursor_key,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict:
        "primary_slug,sub_slug,region,city,district,geo_part,list_limit,ui_lang,list_scope,cursor_key",
    }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[stores-browse-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  primary: string,
  sub: string
): Promise<{ payload: StoresBrowseSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(STORES_BROWSE_SNAPSHOT_RPC, {
    p_region: "",
    p_category: primary.trim().toLowerCase(),
    p_sort: "",
    p_limit: STORES_BROWSE_SNAPSHOT_FETCH_CAP,
    p_cursor: "",
    p_search: "",
    p_sub: sub.trim().toLowerCase(),
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[stores-browse-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseStoresBrowseSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia | "legacy_multi_wave";
  fallback?: boolean;
  orderingMs?: number;
  /** v4 PERF-22 — 이 요청의 실제 DB 왕복 수 (`countSupabaseRoundTrips`). 없으면 기존 추정값 */
  roundTrips?: number;
}): StoresBrowseSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  const fallback = input.fallback === true;
  return {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.roundTrips ?? (fallback ? 3 : 1),
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    stores_fetch_ms: dbMs,
    category_join_ms: fallback ? dbMs : 0,
    review_merge_ms: 0,
    rating_merge_ms: 0,
    delivery_meta_merge_ms: 0,
    recommendation_merge_ms: 0,
    search_filter_compute_ms: 0,
    ordering_compute_ms: Math.round(input.orderingMs ?? 0),
    availability_check_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: fallback ? 2 : 1,
    query_wave_2_ms: fallback ? 120 : 0,
    sequential_await_detected: fallback ? 1 : 0,
    aggregate_compute_detected: fallback ? 1 : 0,
    repeated_join_detected: fallback ? 1 : 0,
    fallback_used: fallback ? 1 : 0,
    rpc_removed: fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: fallback
      ? "legacy_stores_browse_multi_wave"
      : input.via === "counter_row"
        ? "stores_browse_snapshot_row"
        : "stores_browse_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

/**
 * Browse list MUST NOT call Google Route Matrix for distance policy.
 * SERVICEABILITY = haversine only (`evaluateDeliveryServiceability`).
 * Google Routes remain on ETA/checkout paths (`delivery-eta`, ride_time_source=google) — separate authority.
 * Previously: policy.enabled + source===google triggered Matrix for every listed store (HIGH cost risk).
 */
async function loadBrowseRouteMetricsIfNeeded(
  ctx: StoresBrowseRequestContext,
  _filteredRows: StoreBrowseRow[],
): Promise<StoresBrowseRequestContext> {
  void _filteredRows;
  if (ctx.routeMetricsByStoreId) return ctx;
  return { ...ctx, routeMetricsByStoreId: null };
}

async function finishFromPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  ctx: StoresBrowseRequestContext,
  sb: SupabaseClient<any>,
  input: {
    totalMs: number;
    readMs: number;
    via: SnapshotReadVia;
    payloadBuildMs?: number;
    /** 오래된 저장 행에서 읽었을 때만 true — 순위 매장 ⊄ payload.store_rows 이면 sentinel 반환 (재조회 1회) */
    detectStaleMismatch?: boolean;
    opts?: StoresBrowseSnapshotLoadOptions;
    /** v4 PERF-22 — 요청 단위 실제 DB 왕복 수 */
    roundTrips?: () => number;
  }
): Promise<StoresBrowseSnapshotReadResult | StaleSnapshotMismatch | null> {
  const early = earlyBrowseBodyFromRpcPayload(
    payload,
    ctx.primary,
    ctx.sub,
    ctx.wantsAllSubs
  );
  if (early) {
    const earlyRoundTrips = input.roundTrips?.();
    const breakdown = buildBreakdown({
      totalMs: input.totalMs,
      readMs: input.readMs,
      payloadBuildMs: 0,
      via: input.via,
      roundTrips: earlyRoundTrips,
    });
    logStoresBrowseMonolithAnalysis(breakdown);
    evaluateStoresBrowseRegressionGuards(breakdown);
    return {
      body: early,
      breakdown,
      snapshotVia: input.via,
      rpcWallMs: Math.round(input.readMs),
      transformMs: 0,
      dbBaseMs: Math.round(input.readMs),
      dbRelatedMs: 0,
      resultCount: 0,
      queryCount: earlyRoundTrips ?? 1,
      v2: {
        base_query_ms: Math.round(input.readMs),
        category_query_ms: 0,
        product_preview_query_ms: 0,
        review_summary_query_ms: 0,
        distance_sort_ms: 0,
        query_count: earlyRoundTrips ?? 1,
        selected_columns: BROWSE_STORE_ROW_SELECTED_COLUMNS,
      },
      early: true,
    };
  }

  if (payload.ok === false) return null;
  if (payload.ok !== true) return null;

  const bundle = storesBrowseDbBundleFromRpcPayload(
    payload,
    ctx.primary,
    ctx.sub,
    ctx.wantsAllSubs,
    Math.round(input.readMs)
  );

  let prefetchedFilter;
  /** v4 PERF-06 — 순위 단계에서 읽은 서비스 영역 (홈 F-03 방식) — 최종 조립이 덮는 매장이면 재조회 없음 */
  let rankingServiceAreaById: ReadonlyMap<string, StoreServiceAreaRuntimeSlice> | null = null;
  if (isStoreDiscoveryRankingAuthorityNew()) {
    const distanceAxisEnabled =
      ctx.deliveryDistancePolicy.enabled && ctx.origin.lat != null && ctx.origin.lng != null;
    const live = await loadBrowseDiscoveryRankedForLive(sb, {
      sort: ctx.sort,
      originLat: ctx.origin.lat,
      originLng: ctx.origin.lng,
      originSource: ctx.origin.source,
      memberLguId: ctx.origin.canonicalLguId,
      district: ctx.district,
      distanceAxisEnabled,
      storeCategoryId: bundle.taxonomySlice.categoryId
        ? String(bundle.taxonomySlice.categoryId)
        : null,
      storeTopicId: bundle.taxonomySlice.resolvedTopicId
        ? String(bundle.taxonomySlice.resolvedTopicId)
        : null,
      wantsAllSubs: ctx.wantsAllSubs,
      /** CUT 3 — FK membership only; no business_type orphan expansion */
      orphanBusinessTypes: [],
      page: ctx.page,
      limit: ctx.limit,
      exposureScope: buildStoreDiscoveryBrowseExposureScope({
        primary: ctx.primary,
        sub: ctx.sub,
        regionQ: ctx.regionQ,
        cityQ: ctx.cityQ,
        district: ctx.district,
        geoPart: ctx.origin.cacheGeoPart,
      }),
    });
    if (!live.ok) {
      // Fail-closed — never silent-fallback to OLD full-candidate ranking.
      throw new Error(`discovery_ranking_${live.status}`);
    }
    rankingServiceAreaById = live.serviceAreaById;
    /** NEW wave 후보도 Filter CONTRACT 로 재추림 — null-topic 전 2차 누수 금지 */
    prefetchedFilter = applyBrowseSubFilterContractToPrefetchedFilter(
      ctx,
      bundle.taxonomySlice,
      live.filter
    );
    /** NEW authority sort=rating — consume existing C/m policy (OLD path already wired). */
    if (ctx.sort === "rating") {
      const conf = await loadStoreRatingConfidencePolicy(sb);
      prefetchedFilter = applyNewAuthorityRatingConfidenceToBrowseFilter(
        ctx,
        prefetchedFilter,
        conf.policy,
        conf.status
      );
    }
    if (ctx.sort === "fast") {
      prefetchedFilter = applyNewAuthorityFastPrepSortToBrowseFilter(ctx, prefetchedFilter);
    }
    if (ctx.sort === "distance") {
      prefetchedFilter = applyNewAuthorityDistanceSortToBrowseFilter(ctx, prefetchedFilter);
    }
  } else {
    logStoreDiscoveryAuthorityRuntime({
      surface: "browse",
      authority: "old",
      status: "old_path",
    });
    const directCandidates = await loadBrowseDiscoveryCandidateRows(sb, ctx, bundle.taxonomySlice);
    const storeRowsForRank = selectBrowseStoreRowsForRanking(
      directCandidates,
      bundle.storeRowsRaw
    );
    if (directCandidates.status === "error") {
      console.error(
        "[stores-browse-snapshot] browse candidate load error — snapshot store rows not used for ranking"
      );
    }
    const bundleForRank = { ...bundle, storeRowsRaw: storeRowsForRank };
    const prefilteredRows = resolveBrowseFilteredStoreRows(
      ctx,
      bundleForRank.taxonomySlice,
      storeRowsForRank
    );
    const needsOrderCounts = ctx.sort === "popular" || ctx.sort === "default";
    let completedOrderCount30dById: Map<string, number> | null = null;
    let completedOrderCountStatus: "ok" | "error" = "ok";
    if (needsOrderCounts) {
      const loadResult = await loadStoreCompletedOrderCount30dMapWithStatus(
        sb,
        prefilteredRows.map((r) => r.id),
        {
          sinceIso: resolveStorePopularitySinceIso(new Date(), ctx.popularityWindowDays ?? 30),
        }
      );
      completedOrderCount30dById = loadResult.counts;
      completedOrderCountStatus = loadResult.status;
    }
    let ratingConfidencePolicy = null as Awaited<
      ReturnType<typeof loadStoreRatingConfidencePolicy>
    >["policy"];
    let ratingConfidenceStatus: Awaited<
      ReturnType<typeof loadStoreRatingConfidencePolicy>
    >["status"] | undefined;
    if (ctx.sort === "rating") {
      const conf = await loadStoreRatingConfidencePolicy(sb);
      ratingConfidencePolicy = conf.policy;
      ratingConfidenceStatus = conf.status;
    }
    const ctxOld = await loadBrowseRouteMetricsIfNeeded(ctx, prefilteredRows);
    const serviceAreaByStoreId = await loadStoreServiceAreaRuntimeMap(
      sb,
      prefilteredRows.map((r) => r.id)
    );
    rankingServiceAreaById = serviceAreaByStoreId;
    prefetchedFilter = resolveBrowseFilteredSortedStoreRows(
      { ...ctxOld, serviceAreaByStoreId },
      bundleForRank.taxonomySlice,
      storeRowsForRank,
      prefilteredRows,
      completedOrderCount30dById,
      completedOrderCountStatus,
      ratingConfidencePolicy,
      ratingConfidenceStatus
    );
  }

  if (input.detectStaleMismatch) {
    const missingStoreIds = rankedStoreIdsMissingFromPayload(payload, prefetchedFilter.rows);
    if (missingStoreIds.length > 0) return { staleMismatch: true, missingStoreIds };
  }

  if (
    isStoreDiscoveryRankingAuthorityNew() &&
    (ctx.sort === "popular" || ctx.sort === "default")
  ) {
    const overlay = await loadStoreCompletedOrderCount30dMapWithStatus(
      sb,
      prefetchedFilter.rows.map((r) => r.id),
      { sinceIso: resolveStorePopularitySinceIso(new Date(), ctx.popularityWindowDays ?? 30) }
    );
    prefetchedFilter = applyPopularityWindowOverlayToBrowseFilter(
      ctx,
      prefetchedFilter,
      overlay.counts,
      overlay.status
    );
  }

  const finalRowIds = prefetchedFilter.rows.map((r) => r.id);
  const [ctxWithDistance, serviceAreaByStoreId] = await Promise.all([
    loadBrowseRouteMetricsIfNeeded(ctx, prefetchedFilter.rows),
    reuseOrLoadBrowseServiceAreaMap(sb, rankingServiceAreaById, finalRowIds),
  ]);
  const assemble0 = devPerfNow();
  const assembled = assembleStoresBrowseResponse(
    { ...ctxWithDistance, serviceAreaByStoreId },
    bundle,
    prefetchedFilter
  );
  const forShelf = input.opts?.purpose === "discovery_shelf";
  const enrich = forShelf
    ? { enrichDbMs: 0, queryCount: 0 }
    : await enrichBrowseStoresWithPlatformPopular(sb, assembled.body.stores);
  const payloadBuildMs = input.payloadBuildMs ?? devPerfNow() - assemble0;
  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
    orderingMs: assembled.transformMs,
    roundTrips: input.roundTrips?.(),
  });
  logStoresBrowseMonolithAnalysis(breakdown);
  evaluateStoresBrowseRegressionGuards(breakdown);
  const rankingAuthority = resolveStoreDiscoveryRankingAuthority();
  const bodyWithAuthority = {
    ...assembled.body,
    meta: {
      ...assembled.body.meta,
      ranking_authority: rankingAuthority,
    },
  };
  let bodyFinal = bodyWithAuthority;
  if (!forShelf) {
    try {
      const withInsertion = await attachStoresBrowseInsertionMeta(sb, bodyWithAuthority, {
        primarySlug: ctx.primary,
        subSlug: ctx.sub,
        viewerUserId: ctx.viewerUserId ?? null,
        scopeMeta: input.opts?.scopeMeta ?? null,
      });
      bodyFinal = {
        ...withInsertion,
        meta: {
          ...withInsertion.meta,
          ranking_authority: rankingAuthority,
        },
      };
    } catch (e) {
      console.error("[stores-browse-snapshot] insertion meta", e);
    }
  }
  return {
    body: bodyFinal,
    breakdown,
    snapshotVia: input.via,
    rpcWallMs: Math.round(input.readMs),
    transformMs: assembled.transformMs,
    dbBaseMs: assembled.dbBaseMs,
    dbRelatedMs: assembled.dbRelatedMs + enrich.enrichDbMs,
    resultCount: assembled.resultCount,
    queryCount: input.roundTrips ? input.roundTrips() : 1 + enrich.queryCount,
    v2: {
      base_query_ms: Math.round(input.readMs),
      category_query_ms: 0,
      product_preview_query_ms: 0,
      review_summary_query_ms: 0,
      distance_sort_ms: bundle.distanceSortMs,
      query_count: input.roundTrips ? input.roundTrips() : 1,
      selected_columns: BROWSE_STORE_ROW_SELECTED_COLUMNS,
    },
  };
}

/**
 * v4 PERF-06 — 순위 단계 서비스 영역 맵(`loadStoreServiceAreaRuntimeMap` 결과 — 입력 id 전부 키 보유)이
 * 최종 행을 모두 덮으면 그대로 재사용, 아니면 기존처럼 1회 조회.
 */
export async function reuseOrLoadBrowseServiceAreaMap(
  sb: SupabaseClient<any>,
  ranking: ReadonlyMap<string, StoreServiceAreaRuntimeSlice> | null,
  finalRowIds: readonly string[]
): Promise<Map<string, StoreServiceAreaRuntimeSlice>> {
  if (ranking && finalRowIds.every((id) => ranking.has(id))) {
    return new Map(finalRowIds.map((id) => [id, ranking.get(id)!] as const));
  }
  return loadStoreServiceAreaRuntimeMap(sb, [...finalRowIds]);
}

/** `finishFromPayload` 가 null 을 반환하지 않는 payload 인지 — ctx 무관(early 분기 또는 ok:true). */
function isFinishableSnapshotPayload(payload: StoresBrowseSnapshotPayloadJson): boolean {
  if (payload.unknown_primary || payload.unknown_topic) return true;
  return payload.ok === true;
}

/**
 * 5-C BR-01 — 실시간 순위(또는 OLD 후보) 매장 중 payload.store_rows 에 없는 매장 id.
 * 메뉴 미리보기(featuredItems)·배너는 payload 에서만 오므로 store_rows 에 없는 매장은 「더보기」로 빠진다.
 * (store_rows 는 RPC 가 상품 유무와 무관하게 scope 매장을 모두 담는다 — 상품 0개 매장은 불일치 아님.)
 */
export function rankedStoreIdsMissingFromPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  rankedRows: readonly { id: string }[]
): string[] {
  if (rankedRows.length === 0) return [];
  const present = new Set<string>();
  for (const raw of Array.isArray(payload.store_rows) ? payload.store_rows : []) {
    const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : null;
    if (id != null) present.add(String(id));
  }
  return rankedRows.map((r) => String(r.id)).filter((id) => !present.has(id));
}

type SharedSnapshotPayloadRead = {
  payload: StoresBrowseSnapshotPayloadJson;
  readMs: number;
  via: SnapshotReadVia;
  /** counter_row 이고 TTL 초과 — 순위 불일치 시 원본 재조회 대상 */
  stale: boolean;
};

/**
 * DSC-01 — 단일 비행은 사용자 무관한 원본 payload 읽기(counter row → unified RPC + upsert)만 공유한다.
 * origin·sort·page·limit·언어·viewer 를 쓰는 `finishFromPayload` 는 호출자별 ctx 로 따로 실행
 * (공유 Promise 안에서 첫 호출자의 ctx 로 조립하면 다른 사용자에게 그 결과가 전달됨).
 */
function readSharedSnapshotPayload(
  sbAny: SupabaseClient<any>,
  ctx: StoresBrowseRequestContext,
  opts?: StoresBrowseSnapshotLoadOptions
): Promise<SharedSnapshotPayloadRead | null> {
  const bundleKeys = storesBrowseSnapshotBundleKeyParts(ctx.primary, ctx.sub);
  const flightKey = `${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${bundleKeys.primary_slug}:${bundleKeys.sub_slug}:${
    opts?.bypassCounter ? "rpc" : "counter"
  }`;

  return runSingleFlight(flightKey, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, bundleKeys);
      const readMs = devPerfNow() - read0;

      if (counter.hit) {
        const payload = counter.row.payload_json;
        const early = Boolean(payload.unknown_primary || payload.unknown_topic);
        /** 오래된 「없는 업종/주제」 판정은 그대로 쓰지 않는다 — 원본으로 즉시 다시 읽음(아래 RPC). */
        if (!(counter.stale && early) && isFinishableSnapshotPayload(payload)) {
          /** 갱신 예약은 호출자가 순위 대조 후 결정 (`tryLoadStoresBrowseFromSnapshot`) — 원본 RPC 중복 방지 */
          return { payload, readMs, via: "counter_row" as const, stale: counter.stale };
        }
      }
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, ctx.primary, ctx.sub);
    if (!payload) return null;
    await upsertSnapshotCounter(sbAny, bundleKeys, payload);
    return { payload, readMs: rpcMs || devPerfNow() - build0, via: "unified_rpc" as const, stale: false };
  });
}

function isStaleSnapshotMismatch(
  v: StoresBrowseSnapshotReadResult | StaleSnapshotMismatch | null
): v is StaleSnapshotMismatch {
  return v != null && "staleMismatch" in v;
}

export async function tryLoadStoresBrowseFromSnapshot(
  sbAny: SupabaseClient<any>,
  ctx: StoresBrowseRequestContext,
  opts?: StoresBrowseSnapshotLoadOptions
): Promise<StoresBrowseSnapshotReadResult | null> {
  logStoresBrowseSnapshotRpcDesignOnce();
  const build0 = devPerfNow();
  /** v4 PERF-22 — 요청 단위 실제 DB 왕복 수 (성능 로그·회귀 가드 — 고정값 제거) */
  const trips = countSupabaseRoundTrips(sbAny);
  const sbCounted = trips.client;
  const shared = await readSharedSnapshotPayload(sbCounted, ctx, opts);
  if (!shared) return null;
  const staleRow = shared.via === "counter_row" && shared.stale;
  const first = await finishFromPayload(shared.payload, ctx, sbCounted, {
    totalMs: devPerfNow() - build0,
    readMs: shared.readMs,
    via: shared.via,
    /** 선반 소스는 매장 행만 쓰고 메뉴 미리보기를 표시하지 않음 — 순위 대조 생략(갱신 예약만) */
    detectStaleMismatch: staleRow && opts?.purpose !== "discovery_shelf",
    opts,
    roundTrips: trips.count,
  });
  if (!isStaleSnapshotMismatch(first)) {
    /** 5-C BR-01 — 오래된 행은 요청한 (1차, 2차) 키 그대로 백그라운드 갱신 (이전: 항상 1차 「전체」만). */
    if (staleRow) scheduleStoresBrowseSnapshotRefresh(ctx.primary, ctx.sub);
    return first;
  }

  /**
   * 5-C BR-01 — 오래된 저장 행이 순위 매장을 담지 못함(2차 행 고정 사례). 그 payload 는 쓰지 않고
   * 같은 (1차, 2차) 원본 RPC 로 즉시 다시 읽어(진행 중 갱신이 있으면 합류 — RPC 1회·저장 행도 갱신) 조립한다.
   * 재조회 결과로는 다시 판정하지 않는다(무한 재시도 없음). 재조회 실패 시 기존 payload 로 조립.
   */
  if (process.env.NODE_ENV === "development") {
    console.warn("[stores-browse-snapshot] stale row missing ranked stores — rpc re-read", {
      primary: ctx.primary,
      sub: ctx.sub,
      missing: first.missingStoreIds.length,
    });
  }
  const reread0 = devPerfNow();
  const fresh = await refreshStoresBrowseSnapshotKey(sbCounted, ctx.primary, ctx.sub).catch(() => null);
  const rereadMs = devPerfNow() - reread0;
  const second = await finishFromPayload(fresh ?? shared.payload, ctx, sbCounted, {
    totalMs: devPerfNow() - build0,
    readMs: fresh ? shared.readMs + rereadMs : shared.readMs,
    via: fresh ? "unified_rpc" : shared.via,
    detectStaleMismatch: false,
    opts,
    roundTrips: trips.count,
  });
  return isStaleSnapshotMismatch(second) ? null : second;
}

export async function refreshStoresBrowseSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  primary: string,
  sub: string
): Promise<StoresBrowseSnapshotPayloadJson | null> {
  const bundleKeys = storesBrowseSnapshotBundleKeyParts(primary, sub);
  const { payload } = await fetchSnapshotViaRpc(sbAny, primary, sub);
  if (!payload || payload.ok === false) return null;
  await upsertSnapshotCounter(sbAny, bundleKeys, payload);
  return payload;
}

export function logLegacyStoresBrowseHotpath(input: {
  totalMs: number;
  dbMs: number;
  storesFetchMs: number;
  wave2Ms: number;
  orderingMs?: number;
}): void {
  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.dbMs,
    payloadBuildMs: 0,
    via: "legacy_multi_wave",
    fallback: true,
    orderingMs: input.orderingMs,
  });
  logStoresBrowseMonolithAnalysis(breakdown);
  evaluateStoresBrowseRegressionGuards(breakdown);
}

