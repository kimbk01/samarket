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
import { scheduleStoresBrowseSnapshotRefresh } from "@/lib/stores/stores-browse-snapshot-refresh";
import {
  assembleStoresBrowseResponse,
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  resolveBrowseFilteredSortedStoreRows,
  resolveBrowseFilteredStoreRows,
  type StoreBrowseRow,
  type StoresBrowseAssembleResult,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchRouteLegMetricsByStoreId } from "@/lib/geo/google-routes-two-wheeler-matrix";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "sb1-stores-browse-snapshot:";
const ROUTE = "/api/stores/browse";

type SnapshotReadVia = "counter_row" | "unified_rpc";

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

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof storesBrowseSnapshotBundleKeyParts>,
  payload: StoresBrowseSnapshotPayloadJson
): Promise<void> {
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
}): StoresBrowseSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  const fallback = input.fallback === true;
  return {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: fallback ? 3 : 1,
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

async function loadBrowseRouteMetricsIfNeeded(
  ctx: StoresBrowseRequestContext,
  filteredRows: StoreBrowseRow[],
): Promise<StoresBrowseRequestContext> {
  if (
    ctx.deliveryDistancePolicy.source !== "google" ||
    !ctx.deliveryDistancePolicy.enabled ||
    ctx.origin.lat == null ||
    ctx.origin.lng == null
  ) {
    return ctx;
  }
  const eligible = filteredRows
    .filter((row) => ctx.storeDistanceOverrides.stores[row.id]?.mode !== "disabled")
    .map((row) => ({ id: row.id, lat: row.lat, lng: row.lng }));
  if (eligible.length === 0) return ctx;
  const routeMetricsByStoreId = await fetchRouteLegMetricsByStoreId({
    user: { lat: ctx.origin.lat, lng: ctx.origin.lng },
    stores: eligible,
  });
  return { ...ctx, routeMetricsByStoreId };
}

async function finishFromPayload(
  payload: StoresBrowseSnapshotPayloadJson,
  ctx: StoresBrowseRequestContext,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia; payloadBuildMs?: number }
): Promise<StoresBrowseSnapshotReadResult | null> {
  const early = earlyBrowseBodyFromRpcPayload(
    payload,
    ctx.primary,
    ctx.sub,
    ctx.wantsAllSubs
  );
  if (early) {
    const breakdown = buildBreakdown({
      totalMs: input.totalMs,
      readMs: input.readMs,
      payloadBuildMs: 0,
      via: input.via,
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
      queryCount: 1,
      v2: {
        base_query_ms: Math.round(input.readMs),
        category_query_ms: 0,
        product_preview_query_ms: 0,
        review_summary_query_ms: 0,
        distance_sort_ms: 0,
        query_count: 1,
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
  const prefilteredRows = resolveBrowseFilteredStoreRows(ctx, bundle.taxonomySlice, bundle.storeRowsRaw);
  const ctxWithDistance = await loadBrowseRouteMetricsIfNeeded(ctx, prefilteredRows);
  const prefetchedFilter = resolveBrowseFilteredSortedStoreRows(
    ctxWithDistance,
    bundle.taxonomySlice,
    bundle.storeRowsRaw,
    prefilteredRows,
  );
  const assemble0 = devPerfNow();
  const assembled = assembleStoresBrowseResponse(ctxWithDistance, bundle, prefetchedFilter);
  const payloadBuildMs = input.payloadBuildMs ?? devPerfNow() - assemble0;
  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
    orderingMs: assembled.transformMs,
  });
  logStoresBrowseMonolithAnalysis(breakdown);
  evaluateStoresBrowseRegressionGuards(breakdown);
  return {
    body: assembled.body,
    breakdown,
    snapshotVia: input.via,
    rpcWallMs: Math.round(input.readMs),
    transformMs: assembled.transformMs,
    dbBaseMs: assembled.dbBaseMs,
    dbRelatedMs: assembled.dbRelatedMs,
    resultCount: assembled.resultCount,
    queryCount: 1,
    v2: {
      base_query_ms: Math.round(input.readMs),
      category_query_ms: 0,
      product_preview_query_ms: 0,
      review_summary_query_ms: 0,
      distance_sort_ms: bundle.distanceSortMs,
      query_count: 1,
      selected_columns: BROWSE_STORE_ROW_SELECTED_COLUMNS,
    },
  };
}

export async function tryLoadStoresBrowseFromSnapshot(
  sbAny: SupabaseClient<any>,
  ctx: StoresBrowseRequestContext,
  opts?: { bypassCounter?: boolean }
): Promise<StoresBrowseSnapshotReadResult | null> {
  logStoresBrowseSnapshotRpcDesignOnce();
  const bundleKeys = storesBrowseSnapshotBundleKeyParts(ctx.primary, ctx.sub);
  const flightKey = `${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${bundleKeys.primary_slug}:${bundleKeys.sub_slug}`;

  return runSingleFlight(flightKey, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, bundleKeys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const done = await finishFromPayload(counter.row.payload_json, ctx, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
      if (counter.hit && counter.stale) {
        scheduleStoresBrowseSnapshotRefresh(ctx.primary);
        const done = await finishFromPayload(counter.row.payload_json, ctx, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, ctx.primary, ctx.sub);
    if (!payload) return null;
    await upsertSnapshotCounter(sbAny, bundleKeys, payload);
    return finishFromPayload(payload, ctx, {
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - build0,
      via: "unified_rpc",
    });
  });
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

