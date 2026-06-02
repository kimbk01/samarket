/**
 * SOL1 buyer store orders list snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBuyerStoreOrdersListResponseBody,
  buyerStoreOrdersListFromPayload,
  buyerStoreOrdersListSnapshotGateFromPayload,
  parseBuyerStoreOrdersListSnapshotRpcData,
  type BuyerStoreOrderListApiRow,
  type BuyerStoreOrdersListSnapshotPayloadJson,
} from "@/lib/stores/buyer-store-orders-list-snapshot-assemble";
import {
  BUYER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
  BUYER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
  BUYER_STORE_ORDERS_LIST_SNAPSHOT_RPC,
  BUYER_STORE_ORDERS_LIST_SNAPSHOT_TABLE,
  buyerStoreOrdersListSnapshotCacheKeyParts,
  buyerStoreOrdersListSnapshotCounterTtlMs,
} from "@/lib/stores/buyer-store-orders-list-snapshot-counter";
import {
  logBuyerOrdersListMonolithAnalysis,
  logBuyerStoreOrdersListSnapshotRpcDesignOnce,
} from "@/lib/stores/buyer-store-orders-list-snapshot-hotpath-analysis";
import {
  evaluateBuyerOrdersListRegressionGuards,
  type BuyerStoreOrdersListSnapshotBreakdown,
} from "@/lib/stores/buyer-store-orders-list-snapshot-regression-guard";
import {
  clearBuyerStoreOrdersListSnapshotInvalidation,
  peekBuyerStoreOrdersListSnapshotInvalidated,
} from "@/lib/stores/buyer-store-orders-list-snapshot-cache";
import { scheduleBuyerStoreOrdersListSnapshotRefresh } from "@/lib/stores/buyer-store-orders-list-snapshot-refresh";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "sol1-buyer-orders-list-snapshot:";
const ROUTE = "/api/me/store-orders";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: BuyerStoreOrdersListSnapshotPayloadJson;
  updated_at: string;
};

export type BuyerStoreOrdersListSnapshotReadResult = {
  body: ReturnType<typeof buildBuyerStoreOrdersListResponseBody>;
  breakdown: BuyerStoreOrdersListSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
  rpcWallMs: number;
};

function counterSelectFields(): string {
  return [
    "buyer_user_id",
    "list_scope",
    "status_filter",
    "list_limit",
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
    payload_json: payload as BuyerStoreOrdersListSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof buyerStoreOrdersListSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(BUYER_STORE_ORDERS_LIST_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("buyer_user_id", keys.buyer_user_id)
    .eq("list_scope", keys.list_scope)
    .eq("status_filter", keys.status_filter)
    .eq("list_limit", keys.list_limit)
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
  return { hit: true, row, ageMs, stale: ageMs > buyerStoreOrdersListSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof buyerStoreOrdersListSnapshotCacheKeyParts>,
  payload: BuyerStoreOrdersListSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(BUYER_STORE_ORDERS_LIST_SNAPSHOT_TABLE).upsert(
    {
      buyer_user_id: keys.buyer_user_id,
      list_scope: keys.list_scope,
      status_filter: keys.status_filter,
      list_limit: keys.list_limit,
      cursor_key: keys.cursor_key,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "buyer_user_id,list_scope,status_filter,list_limit,cursor_key" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[buyer-orders-list-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  buyerUserId: string,
  status: string,
  limit: number,
  cursor: string
): Promise<{ payload: BuyerStoreOrdersListSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(BUYER_STORE_ORDERS_LIST_SNAPSHOT_RPC, {
    p_user_id: buyerUserId.trim(),
    p_status: status,
    p_limit: limit,
    p_cursor: cursor,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[buyer-orders-list-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseBuyerStoreOrdersListSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): BuyerStoreOrdersListSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.fallback ? 3 : 1,
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    orders_fetch_ms: dbMs,
    store_join_ms: input.fallback ? dbMs : 0,
    items_summary_ms: input.fallback ? dbMs : 0,
    payment_merge_ms: 0,
    refund_merge_ms: 0,
    delivery_merge_ms: 0,
    unread_merge_ms: input.fallback ? dbMs : 0,
    ordering_compute_ms: 0,
    viewer_validation_ms: 0,
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
      ? "legacy_buyer_orders_list_multi_wave"
      : input.via === "counter_row"
        ? "buyer_store_orders_list_snapshot_row"
        : "buyer_store_orders_list_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

function finishFromPayload(
  payload: BuyerStoreOrdersListSnapshotPayloadJson,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia; payloadBuildMs?: number }
): BuyerStoreOrdersListSnapshotReadResult | { ok: false; status: number; error: string } {
  const gate = buyerStoreOrdersListSnapshotGateFromPayload(payload);
  if (!gate.ok) {
    return { ok: false, status: gate.status, error: gate.error };
  }
  const assemble0 = devPerfNow();
  const orders = buyerStoreOrdersListFromPayload(payload);
  const body = buildBuyerStoreOrdersListResponseBody(orders);
  const payloadBuildMs = input.payloadBuildMs ?? devPerfNow() - assemble0;
  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
  });
  logBuyerOrdersListMonolithAnalysis(breakdown);
  evaluateBuyerOrdersListRegressionGuards(breakdown);
  return {
    body,
    breakdown,
    snapshotVia: input.via,
    rpcWallMs: Math.round(input.readMs),
  };
}

export async function tryLoadBuyerStoreOrdersListFromSnapshot(
  sbAny: SupabaseClient<any>,
  buyerUserId: string,
  opts?: { status?: string; limit?: number; cursor?: string; bypassCounter?: boolean }
): Promise<
  | BuyerStoreOrdersListSnapshotReadResult
  | { ok: false; status: number; error: string }
  | null
> {
  const uid = buyerUserId.trim();
  if (!uid) return null;

  logBuyerStoreOrdersListSnapshotRpcDesignOnce();
  const keys = buyerStoreOrdersListSnapshotCacheKeyParts({
    buyerUserId: uid,
    status: opts?.status,
    limit: opts?.limit ?? BUYER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
    cursor: opts?.cursor,
    listScope: BUYER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
  });

  return runSingleFlight(
    `${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.buyer_user_id}:${keys.list_limit}:${keys.status_filter}:${keys.cursor_key}`,
    async () => {
      const build0 = devPerfNow();
      const bypassCounter = opts?.bypassCounter || peekBuyerStoreOrdersListSnapshotInvalidated(uid);
      if (bypassCounter) {
        clearBuyerStoreOrdersListSnapshotInvalidation(uid);
      }

      if (!bypassCounter) {
        const read0 = devPerfNow();
        const counter = await readSnapshotCounter(sbAny, keys);
        const readMs = devPerfNow() - read0;

        if (counter.hit && !counter.stale) {
          const done = finishFromPayload(counter.row.payload_json, {
            totalMs: devPerfNow() - build0,
            readMs,
            via: "counter_row",
          });
          if ("body" in done) return done;
          if ("ok" in done && done.ok === false) return done;
        }
        if (counter.hit && counter.stale) {
          scheduleBuyerStoreOrdersListSnapshotRefresh(uid);
          const done = finishFromPayload(counter.row.payload_json, {
            totalMs: devPerfNow() - build0,
            readMs,
            via: "counter_row",
          });
          if ("body" in done) return done;
          if ("ok" in done && done.ok === false) return done;
        }
      }

      const { payload, rpcMs } = await fetchSnapshotViaRpc(
        sbAny,
        uid,
        keys.status_filter,
        keys.list_limit,
        keys.cursor_key
      );
      if (!payload) return null;
      if (payload.ok === false) {
        const err = String(payload.error ?? "forbidden");
        return { ok: false, status: err === "unauthorized" ? 401 : 500, error: err };
      }
      if (payload.ok !== true) return null;

      await upsertSnapshotCounter(sbAny, keys, payload);
      const done = finishFromPayload(payload, {
        totalMs: devPerfNow() - build0,
        readMs: rpcMs || devPerfNow() - build0,
        via: "unified_rpc",
      });
      if ("body" in done) return done;
      return null;
    }
  );
}

export async function refreshBuyerStoreOrdersListSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  buyerUserId: string
): Promise<BuyerStoreOrdersListSnapshotPayloadJson | null> {
  const keys = buyerStoreOrdersListSnapshotCacheKeyParts({
    buyerUserId,
    listScope: BUYER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
    limit: BUYER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
  });
  const { payload } = await fetchSnapshotViaRpc(
    sbAny,
    keys.buyer_user_id,
    keys.status_filter,
    keys.list_limit,
    keys.cursor_key
  );
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}

export function logLegacyBuyerStoreOrdersListHotpath(input: {
  totalMs: number;
  dbMs: number;
  ordersFetchMs: number;
  wave2Ms: number;
}): void {
  const breakdown: BuyerStoreOrdersListSnapshotBreakdown = {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: Math.round(input.dbMs),
    round_trips: 3,
    transport_ms: Math.round(input.dbMs),
    payload_build_ms: 0,
    orders_fetch_ms: Math.round(input.ordersFetchMs),
    store_join_ms: Math.round(input.wave2Ms),
    items_summary_ms: Math.round(input.wave2Ms),
    payment_merge_ms: 0,
    refund_merge_ms: 0,
    delivery_merge_ms: 0,
    unread_merge_ms: Math.round(input.wave2Ms),
    ordering_compute_ms: 0,
    viewer_validation_ms: 0,
    cache_hit: 0,
    wave_count: 2,
    query_wave_2_ms: Math.round(input.wave2Ms),
    sequential_await_detected: 1,
    aggregate_compute_detected: 1,
    repeated_join_detected: 1,
    fallback_used: 1,
    rpc_removed: 0,
    snapshot_via: "legacy_multi_wave",
    worst_stage: "legacy_buyer_orders_list_multi_wave",
    worst_stage_ms: Math.round(input.dbMs),
  };
  logBuyerOrdersListMonolithAnalysis(breakdown);
  evaluateBuyerOrdersListRegressionGuards(breakdown);
}

export type { BuyerStoreOrderListApiRow };
