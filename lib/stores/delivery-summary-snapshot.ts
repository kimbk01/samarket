/**
 * Delivery summary snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverySummaryGateFromPayload,
  parseDeliverySummarySnapshotRpcData,
  type DeliverySummarySnapshotPayloadJson,
} from "@/lib/stores/delivery-summary-snapshot-assemble";
import {
  DELIVERY_SUMMARY_DEFAULT_SCOPE,
  DELIVERY_SUMMARY_SNAPSHOT_TABLE,
  deliverySummarySnapshotCacheKeyParts,
  deliverySummarySnapshotCounterTtlMs,
} from "@/lib/stores/delivery-summary-snapshot-counter";
import { scheduleDeliverySummarySnapshotRefresh } from "@/lib/stores/delivery-summary-snapshot-refresh";
import {
  evaluateDeliverySummaryRegressionGuards,
  type DeliverySummarySnapshotBreakdown,
} from "@/lib/stores/delivery-summary-snapshot-regression-guard";
import {
  logDeliverySummaryHotpathAnalysis,
  logDeliverySummarySnapshotRpcDesignOnce,
} from "@/lib/stores/delivery-summary-snapshot-hotpath-analysis";
import type { DashboardSnapshotGate } from "@/lib/stores/fetch-owner-store-order-counts-dashboard-snapshot-rpc";
import type { OrderCountsColdBreakdown } from "@/lib/stores/order-counts-cold-breakdown";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const DELIVERY_SUMMARY_SNAPSHOT_RPC = "get_delivery_summary_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "dsa-snapshot:";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: DeliverySummarySnapshotPayloadJson;
  updated_at: string;
};

function counterSelectFields(): string {
  return ["store_id", "owner_user_id", "summary_scope", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    payload_json: payload as DeliverySummarySnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof deliverySummarySnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(DELIVERY_SUMMARY_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("store_id", keys.store_id)
    .eq("owner_user_id", keys.owner_user_id)
    .eq("summary_scope", keys.summary_scope)
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
  return { hit: true, row, ageMs, stale: ageMs > deliverySummarySnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof deliverySummarySnapshotCacheKeyParts>,
  payload: DeliverySummarySnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(DELIVERY_SUMMARY_SNAPSHOT_TABLE).upsert(
    {
      store_id: keys.store_id,
      owner_user_id: keys.owner_user_id,
      summary_scope: keys.summary_scope,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,owner_user_id,summary_scope" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[delivery-summary-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string,
  summaryScope: string
): Promise<{ payload: DeliverySummarySnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(DELIVERY_SUMMARY_SNAPSHOT_RPC, {
    p_store_id: storeId.trim(),
    p_owner_user_id: ownerUserId.trim(),
    p_summary_scope: summaryScope || DELIVERY_SUMMARY_DEFAULT_SCOPE,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[delivery-summary-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseDeliverySummarySnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  storeId: string;
  readMs: number;
  via: SnapshotReadVia;
  coldBreakdown?: OrderCountsColdBreakdown;
}): DeliverySummarySnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  if (input.coldBreakdown) {
    input.coldBreakdown.rpc_wall_ms = dbMs;
    input.coldBreakdown.ownership_check_ms = 0;
    input.coldBreakdown.store_ops_meta_ms = 0;
  }
  return {
    route: `/api/me/stores/${input.storeId}/order-counts`,
    total_ms: dbMs,
    db_ms: dbMs,
    round_trips: 1,
    transport_ms: dbMs,
    payload_build_ms: 0,
    order_aggregate_ms: dbMs,
    sales_aggregate_ms: 0,
    rider_aggregate_ms: 0,
    refund_aggregate_ms: 0,
    status_group_ms: 0,
    dashboard_badge_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    aggregate_compute_detected: 0,
    repeated_join_detected: 0,
    worst_stage:
      input.via === "counter_row" ? "delivery_summary_snapshot_row" : "delivery_summary_unified_rpc",
    worst_stage_ms: dbMs,
    cache_hit_reason:
      input.via === "counter_row" ? "delivery_summary_snapshot_row" : "delivery_summary_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via === "counter_row" ? "counter_row" : "unified_rpc",
  };
}

export type TryLoadDeliverySummarySnapshotResult =
  | { gate: Extract<DashboardSnapshotGate, { ok: false }> }
  | { snapshot: Extract<DashboardSnapshotGate, { ok: true }>["snapshot"]; breakdown: DeliverySummarySnapshotBreakdown };

export async function tryLoadDeliverySummarySnapshot(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string,
  coldBreakdown?: OrderCountsColdBreakdown,
  summaryScope = DELIVERY_SUMMARY_DEFAULT_SCOPE
): Promise<TryLoadDeliverySummarySnapshotResult | null> {
  logDeliverySummarySnapshotRpcDesignOnce();

  const keys = deliverySummarySnapshotCacheKeyParts({
    storeId,
    ownerUserId,
    summaryScope,
  });

  return runSingleFlight(
    `${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.store_id}:${keys.owner_user_id}:${keys.summary_scope}`,
    async () => {
      const finish = (
        gate: DashboardSnapshotGate,
        readMs: number,
        via: SnapshotReadVia,
        stale?: boolean
      ): TryLoadDeliverySummarySnapshotResult | null => {
        const breakdown = buildBreakdown({ storeId, readMs, via, coldBreakdown });
        logDeliverySummaryHotpathAnalysis(breakdown, {
          structuralNote:
            via === "counter_row"
              ? "request-time delivery aggregate removed — precomputed snapshot row"
              : "unified RPC cold fill — 1 RTT replaces dashboard RPC on every miss",
        });
        evaluateDeliverySummaryRegressionGuards({
          breakdown,
          allowedRoundTrips: 1,
          snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
          staleSnapshot: stale,
        });
        if (!gate.ok) return { gate };
        return { snapshot: gate.snapshot, breakdown };
      };

      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const gate = deliverySummaryGateFromPayload(counter.row.payload_json);
        if (!gate) return null;
        return finish(gate, readMs, "counter_row");
      }
      if (counter.hit && counter.stale) {
        scheduleDeliverySummarySnapshotRefresh(keys.store_id, keys.owner_user_id, keys.summary_scope);
        const gate = deliverySummaryGateFromPayload(counter.row.payload_json);
        if (!gate) return null;
        return finish(gate, readMs, "counter_row", true);
      }

      const { payload, rpcMs } = await fetchSnapshotViaRpc(
        sbAny,
        keys.store_id,
        keys.owner_user_id,
        keys.summary_scope
      );
      if (!payload) return null;

      const gate = deliverySummaryGateFromPayload(payload);
      if (!gate) return null;

      if (gate.ok) {
        await upsertSnapshotCounter(sbAny, keys, payload);
      }

      return finish(gate, rpcMs || devPerfNow() - read0, "unified_rpc");
    }
  );
}

export async function refreshDeliverySummarySnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  storeId: string,
  ownerUserId: string,
  summaryScope = DELIVERY_SUMMARY_DEFAULT_SCOPE
): Promise<DeliverySummarySnapshotPayloadJson | null> {
  const keys = deliverySummarySnapshotCacheKeyParts({
    storeId,
    ownerUserId,
    summaryScope,
  });
  const { payload } = await fetchSnapshotViaRpc(sbAny, storeId, ownerUserId, summaryScope);
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}
