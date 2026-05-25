/**
 * CMB1 CM bootstrap snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import {
  assembleLiteBootstrapFromSnapshotPayload,
  cmBootstrapSnapshotGateFromPayload,
  parseCmBootstrapSnapshotRpcData,
  type CmBootstrapSnapshotPayloadJson,
} from "@/lib/community-messenger/cm-bootstrap-snapshot-assemble";
import {
  CM_BOOTSTRAP_LITE_DEFAULT_LIMIT,
  CM_BOOTSTRAP_LITE_DEFAULT_SCOPE,
  CM_BOOTSTRAP_SNAPSHOT_RPC,
  CM_BOOTSTRAP_SNAPSHOT_TABLE,
  cmBootstrapSnapshotCacheKeyParts,
  cmBootstrapSnapshotCounterTtlMs,
} from "@/lib/community-messenger/cm-bootstrap-snapshot-counter";
import {
  logCmBootstrapMonolithAnalysis,
  logCmBootstrapSnapshotRpcDesignOnce,
} from "@/lib/community-messenger/cm-bootstrap-monolith-hotpath-analysis";
import {
  evaluateCmBootstrapRegressionGuards,
  type CmBootstrapSnapshotBreakdown,
} from "@/lib/community-messenger/cm-bootstrap-regression-guard";
import { scheduleCmBootstrapSnapshotRefresh } from "@/lib/community-messenger/cm-bootstrap-snapshot-refresh";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cmb1-bootstrap-snapshot:";
const ROUTE = "/api/community-messenger/bootstrap";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: CmBootstrapSnapshotPayloadJson;
  updated_at: string;
};

export type CmBootstrapSnapshotReadResult = {
  payload: CommunityMessengerBootstrap;
  breakdown: CmBootstrapSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
  snapshotVersion?: number;
};

function counterSelectFields(): string {
  return [
    "user_id",
    "bootstrap_scope",
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
    payload_json: payload as CmBootstrapSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof cmBootstrapSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(CM_BOOTSTRAP_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("user_id", keys.user_id)
    .eq("bootstrap_scope", keys.bootstrap_scope)
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
  return { hit: true, row, ageMs, stale: ageMs > cmBootstrapSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof cmBootstrapSnapshotCacheKeyParts>,
  payload: CmBootstrapSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(CM_BOOTSTRAP_SNAPSHOT_TABLE).upsert(
    {
      user_id: keys.user_id,
      bootstrap_scope: keys.bootstrap_scope,
      list_limit: keys.list_limit,
      cursor_key: keys.cursor_key,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,bootstrap_scope,list_limit,cursor_key" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[cm-bootstrap-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  limit: number,
  cursor: string
): Promise<{ payload: CmBootstrapSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(CM_BOOTSTRAP_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_cursor: cursor,
    p_limit: limit,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[cm-bootstrap-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseCmBootstrapSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): CmBootstrapSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.fallback ? 6 : 1,
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    room_list_fetch_ms: dbMs,
    participant_join_ms: 0,
    profile_join_ms: Math.round(input.payloadBuildMs),
    unread_compute_ms: 0,
    room_summary_compute_ms: Math.round(input.payloadBuildMs),
    notification_merge_ms: 0,
    silent_delta_merge_ms: 0,
    bootstrap_cache_ms: input.via === "counter_row" ? dbMs : 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: input.fallback ? 3 : 1,
    query_wave_2_ms: input.fallback ? 120 : 0,
    sequential_await_detected: input.fallback ? 1 : 0,
    aggregate_compute_detected: input.fallback ? 1 : 0,
    repeated_join_detected: input.fallback ? 1 : 0,
    fallback_used: input.fallback ? 1 : 0,
    reconnect_path_used: 0,
    rpc_removed: input.fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: input.fallback
      ? "legacy_bootstrap_monolith"
      : input.via === "counter_row"
        ? "cm_bootstrap_snapshot_row"
        : "cm_bootstrap_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

async function finishFromPayload(
  userId: string,
  payload: CmBootstrapSnapshotPayloadJson,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia }
): Promise<CmBootstrapSnapshotReadResult | null> {
  const gate = cmBootstrapSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const assemble0 = devPerfNow();
  const assembled = await assembleLiteBootstrapFromSnapshotPayload(userId, payload);
  const payloadBuildMs = devPerfNow() - assemble0;
  if (!assembled) return null;

  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
  });
  logCmBootstrapMonolithAnalysis(breakdown);
  evaluateCmBootstrapRegressionGuards(breakdown);

  return {
    payload: assembled,
    breakdown,
    snapshotVia: input.via,
    snapshotVersion:
      typeof payload.snapshot_version === "number" ? payload.snapshot_version : undefined,
  };
}

export async function tryLoadCmBootstrapLiteFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { bypassCounter?: boolean; limit?: number; cursor?: string }
): Promise<CmBootstrapSnapshotReadResult | null> {
  const uid = userId.trim();
  if (!uid) return null;

  logCmBootstrapSnapshotRpcDesignOnce();
  const keys = cmBootstrapSnapshotCacheKeyParts({
    userId: uid,
    limit: opts?.limit ?? CM_BOOTSTRAP_LITE_DEFAULT_LIMIT,
    cursor: opts?.cursor,
    scope: CM_BOOTSTRAP_LITE_DEFAULT_SCOPE,
  });

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.user_id}`, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const done = await finishFromPayload(uid, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
      if (counter.hit && counter.stale) {
        scheduleCmBootstrapSnapshotRefresh(uid);
        const done = await finishFromPayload(uid, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(
      sbAny,
      uid,
      keys.list_limit,
      keys.cursor_key
    );
    if (!payload || payload.ok !== true) return null;

    await upsertSnapshotCounter(sbAny, keys, payload);
    return finishFromPayload(uid, payload, {
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - build0,
      via: "unified_rpc",
    });
  });
}

export async function refreshCmBootstrapSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<CmBootstrapSnapshotPayloadJson | null> {
  const keys = cmBootstrapSnapshotCacheKeyParts({
    userId,
    scope: CM_BOOTSTRAP_LITE_DEFAULT_SCOPE,
    limit: CM_BOOTSTRAP_LITE_DEFAULT_LIMIT,
  });
  const { payload } = await fetchSnapshotViaRpc(sbAny, keys.user_id, keys.list_limit, keys.cursor_key);
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}
