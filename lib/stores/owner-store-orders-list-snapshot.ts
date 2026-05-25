/**
 * OOL1 owner store orders list snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import {
  ownerStoreOrdersListFromPayload,
  ownerStoreOrdersListSnapshotGateFromPayload,
  parseOwnerStoreOrdersListSnapshotRpcData,
  type OwnerStoreOrdersListSnapshotPayloadJson,
} from "@/lib/stores/owner-store-orders-list-snapshot-assemble";
import {
  OWNER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
  OWNER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
  OWNER_STORE_ORDERS_LIST_SNAPSHOT_RPC,
  OWNER_STORE_ORDERS_LIST_SNAPSHOT_TABLE,
  ownerStoreOrdersListSnapshotCacheKeyParts,
  ownerStoreOrdersListSnapshotCounterTtlMs,
} from "@/lib/stores/owner-store-orders-list-snapshot-counter";
import {
  logOwnerOrdersListHotpathAnalysis,
  logOwnerStoreOrdersListSnapshotRpcDesignOnce,
} from "@/lib/stores/owner-store-orders-list-snapshot-hotpath-analysis";
import {
  evaluateOwnerOrdersListRegressionGuards,
  type OwnerStoreOrdersListSnapshotBreakdown,
} from "@/lib/stores/owner-store-orders-list-snapshot-regression-guard";
import { scheduleOwnerStoreOrdersListSnapshotRefresh } from "@/lib/stores/owner-store-orders-list-snapshot-refresh";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "ool1-orders-list-snapshot:";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: OwnerStoreOrdersListSnapshotPayloadJson;
  updated_at: string;
};

export type OwnerStoreOrdersListSnapshotReadResult = {
  orders: OwnerStoreOrderListRow[];
  statusCounts: {
    pending_accept_count: number;
    refund_requested_count: number;
    pending_delivery_count: number;
  };
  storePickupAddress: OwnerStoreOrdersListSnapshotPayloadJson["store_pickup_address"];
  breakdown: OwnerStoreOrdersListSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
};

function counterSelectFields(): string {
  return [
    "store_id",
    "owner_user_id",
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
    payload_json: payload as OwnerStoreOrdersListSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof ownerStoreOrdersListSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(OWNER_STORE_ORDERS_LIST_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("store_id", keys.store_id)
    .eq("owner_user_id", keys.owner_user_id)
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
  return { hit: true, row, ageMs, stale: ageMs > ownerStoreOrdersListSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof ownerStoreOrdersListSnapshotCacheKeyParts>,
  payload: OwnerStoreOrdersListSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(OWNER_STORE_ORDERS_LIST_SNAPSHOT_TABLE).upsert(
    {
      store_id: keys.store_id,
      owner_user_id: keys.owner_user_id,
      list_scope: keys.list_scope,
      status_filter: keys.status_filter,
      list_limit: keys.list_limit,
      cursor_key: keys.cursor_key,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "store_id,owner_user_id,list_scope,status_filter,list_limit,cursor_key",
    }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[owner-orders-list-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string,
  status: string,
  limit: number,
  cursor: string
): Promise<{ payload: OwnerStoreOrdersListSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(OWNER_STORE_ORDERS_LIST_SNAPSHOT_RPC, {
    p_store_id: storeId.trim(),
    p_owner_user_id: ownerUserId.trim(),
    p_status: status,
    p_limit: limit,
    p_cursor: cursor,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[owner-orders-list-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseOwnerStoreOrdersListSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  storeId: string;
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): OwnerStoreOrdersListSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: "/api/me/stores/[storeId]/orders",
    store_id: input.storeId,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.fallback ? 3 : 1,
    transport_ms: dbMs,
    payload_build_ms: 0,
    orders_fetch_ms: dbMs,
    customer_profile_join_ms: 0,
    order_items_summary_ms: 0,
    delivery_status_merge_ms: 0,
    payment_status_merge_ms: 0,
    chat_unread_merge_ms: 0,
    status_filter_ms: 0,
    sort_compute_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: input.fallback ? 2 : 1,
    query_wave_2_ms: input.fallback ? 120 : 0,
    sequential_await_detected: input.fallback ? 1 : 0,
    aggregate_compute_detected: input.fallback ? 1 : 0,
    repeated_join_detected: 0,
    fallback_used: input.fallback ? 1 : 0,
    rpc_removed: input.fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: input.fallback
      ? "legacy_multi_wave"
      : input.via === "counter_row"
        ? "owner_store_orders_list_snapshot_row"
        : "owner_store_orders_list_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

function finishFromPayload(
  payload: OwnerStoreOrdersListSnapshotPayloadJson,
  input: { storeId: string; totalMs: number; readMs: number; via: SnapshotReadVia }
): OwnerStoreOrdersListSnapshotReadResult | null {
  const gate = ownerStoreOrdersListSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;
  const orders = ownerStoreOrdersListFromPayload(payload);
  const counts = payload.status_counts_optional ?? {};
  const breakdown = buildBreakdown({
    storeId: input.storeId,
    totalMs: input.totalMs,
    readMs: input.readMs,
    via: input.via,
  });
  logOwnerOrdersListHotpathAnalysis(breakdown, { storeId: input.storeId });
  evaluateOwnerOrdersListRegressionGuards(breakdown);
  return {
    orders,
    statusCounts: {
      pending_accept_count: Math.max(0, Math.floor(Number(counts.pending_accept_count) || 0)),
      refund_requested_count: Math.max(0, Math.floor(Number(counts.refund_requested_count) || 0)),
      pending_delivery_count: Math.max(0, Math.floor(Number(counts.pending_delivery_count) || 0)),
    },
    storePickupAddress: payload.store_pickup_address ?? null,
    breakdown,
    snapshotVia: input.via,
  };
}

export async function tryLoadOwnerStoreOrdersListFromSnapshot(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string,
  opts?: { status?: string; limit?: number; cursor?: string }
): Promise<OwnerStoreOrdersListSnapshotReadResult | null> {
  const sid = storeId.trim();
  const uid = ownerUserId.trim();
  if (!sid || !uid) return null;

  logOwnerStoreOrdersListSnapshotRpcDesignOnce();
  const keys = ownerStoreOrdersListSnapshotCacheKeyParts({
    storeId: sid,
    ownerUserId: uid,
    status: opts?.status,
    limit: opts?.limit ?? OWNER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
    cursor: opts?.cursor,
    listScope: OWNER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
  });

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.store_id}:${keys.owner_user_id}`, async () => {
    const build0 = devPerfNow();

    const read0 = devPerfNow();
    const counter = await readSnapshotCounter(sbAny, keys);
    const readMs = devPerfNow() - read0;

    if (counter.hit && !counter.stale) {
      const done = finishFromPayload(counter.row.payload_json, {
        storeId: sid,
        totalMs: devPerfNow() - build0,
        readMs,
        via: "counter_row",
      });
      if (done) return done;
    }
    if (counter.hit && counter.stale) {
      scheduleOwnerStoreOrdersListSnapshotRefresh(sid, uid);
      const done = finishFromPayload(counter.row.payload_json, {
        storeId: sid,
        totalMs: devPerfNow() - build0,
        readMs,
        via: "counter_row",
      });
      if (done) return done;
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(
      sbAny,
      sid,
      uid,
      keys.status_filter,
      keys.list_limit,
      keys.cursor_key
    );
    if (!payload || payload.ok !== true) return null;

    await upsertSnapshotCounter(sbAny, keys, payload);
    return finishFromPayload(payload, {
      storeId: sid,
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - read0,
      via: "unified_rpc",
    });
  });
}

export async function refreshOwnerStoreOrdersListSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string
): Promise<OwnerStoreOrdersListSnapshotPayloadJson | null> {
  const keys = ownerStoreOrdersListSnapshotCacheKeyParts({
    storeId,
    ownerUserId,
    listScope: OWNER_STORE_ORDERS_LIST_DEFAULT_SCOPE,
    limit: OWNER_STORE_ORDERS_LIST_DEFAULT_LIMIT,
  });
  const { payload } = await fetchSnapshotViaRpc(
    sbAny,
    keys.store_id,
    keys.owner_user_id,
    keys.status_filter,
    keys.list_limit,
    keys.cursor_key
  );
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}

export function invalidateOwnerStoreOrdersListSnapshotCounter(
  storeId: string,
  ownerUserId: string
): void {
  void storeId;
  void ownerUserId;
}
