/**
 * SOD1 store order detail snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBuyerStoreOrderDetailResponseBody,
  parseStoreOrderDetailSnapshotRpcData,
  storeOrderDetailSnapshotGateFromPayload,
  type StoreOrderDetailSnapshotPayloadJson,
} from "@/lib/stores/store-order-detail-snapshot-assemble";
import {
  STORE_ORDER_DETAIL_SNAPSHOT_RPC,
  STORE_ORDER_DETAIL_SNAPSHOT_TABLE,
  STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER,
  storeOrderDetailSnapshotCacheKeyParts,
  storeOrderDetailSnapshotCounterTtlMs,
} from "@/lib/stores/store-order-detail-snapshot-counter";
import {
  logStoreOrderDetailMonolithAnalysis,
  logStoreOrderDetailSnapshotRpcDesignOnce,
} from "@/lib/stores/store-order-detail-snapshot-hotpath-analysis";
import {
  evaluateStoreOrderDetailRegressionGuards,
  type StoreOrderDetailSnapshotBreakdown,
} from "@/lib/stores/store-order-detail-snapshot-regression-guard";
import { scheduleStoreOrderDetailSnapshotRefresh } from "@/lib/stores/store-order-detail-snapshot-refresh";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "sod1-order-detail-snapshot:";
const ROUTE = "/api/me/store-orders/[orderId]";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: StoreOrderDetailSnapshotPayloadJson;
  updated_at: string;
};

export type StoreOrderDetailSnapshotReadResult = {
  body: ReturnType<typeof buildBuyerStoreOrderDetailResponseBody>;
  breakdown: StoreOrderDetailSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
  snapshotVersion?: number;
  rpcWallMs: number;
};

function counterSelectFields(): string {
  return ["order_id", "viewer_user_id", "viewer_scope", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    payload_json: payload as StoreOrderDetailSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof storeOrderDetailSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(STORE_ORDER_DETAIL_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("order_id", keys.order_id)
    .eq("viewer_user_id", keys.viewer_user_id)
    .eq("viewer_scope", keys.viewer_scope)
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
  return { hit: true, row, ageMs, stale: ageMs > storeOrderDetailSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof storeOrderDetailSnapshotCacheKeyParts>,
  payload: StoreOrderDetailSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(STORE_ORDER_DETAIL_SNAPSHOT_TABLE).upsert(
    {
      order_id: keys.order_id,
      viewer_user_id: keys.viewer_user_id,
      viewer_scope: keys.viewer_scope,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id,viewer_user_id,viewer_scope" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[store-order-detail-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  orderId: string,
  viewerUserId: string
): Promise<{ payload: StoreOrderDetailSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(STORE_ORDER_DETAIL_SNAPSHOT_RPC, {
    p_order_id: orderId.trim(),
    p_viewer_user_id: viewerUserId.trim(),
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[store-order-detail-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseStoreOrderDetailSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  orderId: string;
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): StoreOrderDetailSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: ROUTE,
    order_id: input.orderId,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.fallback ? 5 : 1,
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    order_fetch_ms: dbMs,
    items_fetch_ms: input.fallback ? dbMs : 0,
    buyer_profile_join_ms: 0,
    rider_join_ms: 0,
    payment_merge_ms: 0,
    refund_merge_ms: 0,
    timeline_merge_ms: 0,
    unread_merge_ms: 0,
    ownership_check_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: input.fallback ? 2 : 1,
    query_wave_2_ms: input.fallback ? 120 : 0,
    sequential_await_detected: input.fallback ? 1 : 0,
    aggregate_compute_detected: input.fallback ? 1 : 0,
    repeated_join_detected: input.fallback ? 1 : 0,
    fallback_used: input.fallback ? 1 : 0,
    rpc_removed: input.fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: input.fallback
      ? "legacy_order_detail_parallel"
      : input.via === "counter_row"
        ? "store_order_detail_snapshot_row"
        : "store_order_detail_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

function finishFromPayload(
  orderId: string,
  payload: StoreOrderDetailSnapshotPayloadJson,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia; payloadBuildMs?: number }
): StoreOrderDetailSnapshotReadResult | { ok: false; status: number; error: string } {
  const gate = storeOrderDetailSnapshotGateFromPayload(payload);
  if (!gate.ok) {
    return { ok: false, status: gate.status, error: gate.error };
  }
  const assemble0 = devPerfNow();
  const body = buildBuyerStoreOrderDetailResponseBody(gate.data);
  const payloadBuildMs = input.payloadBuildMs ?? devPerfNow() - assemble0;
  const breakdown = buildBreakdown({
    orderId,
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
  });
  logStoreOrderDetailMonolithAnalysis(breakdown);
  evaluateStoreOrderDetailRegressionGuards(breakdown);
  return {
    body,
    breakdown,
    snapshotVia: input.via,
    snapshotVersion:
      typeof payload.snapshot_version === "number" ? payload.snapshot_version : undefined,
    rpcWallMs: Math.round(input.readMs),
  };
}

export async function tryLoadBuyerStoreOrderDetailFromSnapshot(
  sbAny: SupabaseClient<any>,
  buyerUserId: string,
  orderId: string,
  opts?: { bypassCounter?: boolean }
): Promise<
  | StoreOrderDetailSnapshotReadResult
  | { ok: false; status: number; error: string }
  | null
> {
  const uid = buyerUserId.trim();
  const oid = orderId.trim();
  if (!uid || !oid) return null;

  logStoreOrderDetailSnapshotRpcDesignOnce();
  const keys = storeOrderDetailSnapshotCacheKeyParts({
    orderId: oid,
    viewerUserId: uid,
    scope: STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER,
  });

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${oid}:${uid}`, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const done = finishFromPayload(oid, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if ("body" in done) return done;
        if ("ok" in done && done.ok === false) return done;
      }
      if (counter.hit && counter.stale) {
        scheduleStoreOrderDetailSnapshotRefresh(oid, uid);
        const done = finishFromPayload(oid, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if ("body" in done) return done;
        if ("ok" in done && done.ok === false) return done;
      }
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, oid, uid);
    if (!payload) return null;
    if (payload.ok === false) {
      const err = String(payload.error ?? "not_found");
      return { ok: false, status: err === "not_found" ? 404 : 500, error: err };
    }
    if (payload.ok !== true) return null;

    await upsertSnapshotCounter(sbAny, keys, payload);
    const done = finishFromPayload(oid, payload, {
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - build0,
      via: "unified_rpc",
    });
    if ("body" in done) return done;
    return null;
  });
}

export async function refreshStoreOrderDetailSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  viewerUserId: string,
  orderId: string
): Promise<StoreOrderDetailSnapshotPayloadJson | null> {
  const keys = storeOrderDetailSnapshotCacheKeyParts({
    orderId,
    viewerUserId,
    scope: STORE_ORDER_DETAIL_VIEWER_SCOPE_BUYER,
  });
  const { payload } = await fetchSnapshotViaRpc(sbAny, keys.order_id, keys.viewer_user_id);
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}

export function logLegacyStoreOrderDetailHotpath(input: {
  orderId: string;
  totalMs: number;
  dbMs: number;
  orderFetchMs: number;
  itemsFetchMs: number;
  reviewMetaMs: number;
  deliveryMs: number;
}): void {
  const breakdown: StoreOrderDetailSnapshotBreakdown = {
    route: ROUTE,
    order_id: input.orderId,
    total_ms: Math.round(input.totalMs),
    db_ms: Math.round(input.dbMs),
    round_trips: 5,
    transport_ms: Math.round(input.dbMs),
    payload_build_ms: 0,
    order_fetch_ms: Math.round(input.orderFetchMs),
    items_fetch_ms: Math.round(input.itemsFetchMs),
    buyer_profile_join_ms: Math.round(input.reviewMetaMs),
    rider_join_ms: Math.round(input.deliveryMs),
    payment_merge_ms: 0,
    refund_merge_ms: 0,
    timeline_merge_ms: 0,
    unread_merge_ms: 0,
    ownership_check_ms: 0,
    cache_hit: 0,
    wave_count: 2,
    query_wave_2_ms: Math.round(input.itemsFetchMs + input.deliveryMs),
    sequential_await_detected: 1,
    aggregate_compute_detected: 1,
    repeated_join_detected: 1,
    fallback_used: 1,
    rpc_removed: 0,
    snapshot_via: "legacy_parallel",
    worst_stage: "legacy_order_detail_parallel",
    worst_stage_ms: Math.round(input.dbMs),
  };
  logStoreOrderDetailMonolithAnalysis(breakdown);
  evaluateStoreOrderDetailRegressionGuards(breakdown);
}
