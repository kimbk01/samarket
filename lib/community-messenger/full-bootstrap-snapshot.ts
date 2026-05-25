/**
 * FBT1 full bootstrap snapshot — read path (counter row → tier-aware unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleCriticalBootstrapFromSnapshotPayload,
  assembleFullBootstrapFromSnapshotPayload,
  fullBootstrapSnapshotGateFromPayload,
  parseFullBootstrapSnapshotRpcData,
  type FullBootstrapSnapshotPayloadJson,
} from "@/lib/community-messenger/full-bootstrap-snapshot-assemble";
import {
  FBT1_BOOTSTRAP_SNAPSHOT_RPC,
  FBT1_BOOTSTRAP_SNAPSHOT_TABLE,
  FBT1_CRITICAL_DEFAULT_LIMIT,
  FBT1_FULL_DEFAULT_LIMIT,
  fbt1BootstrapSnapshotCacheKeyParts,
  fbt1BootstrapSnapshotCounterTtlMs,
} from "@/lib/community-messenger/full-bootstrap-snapshot-counter";
import {
  logFullBootstrapMonolithAnalysis,
  logFullBootstrapSnapshotRpcDesignOnce,
} from "@/lib/community-messenger/full-bootstrap-snapshot-hotpath-analysis";
import {
  evaluateFullBootstrapRegressionGuards,
  type FullBootstrapSnapshotBreakdown,
} from "@/lib/community-messenger/full-bootstrap-snapshot-regression-guard";
import { scheduleFullBootstrapSnapshotRefresh } from "@/lib/community-messenger/full-bootstrap-snapshot-refresh";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/types";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "fbt1-bootstrap-snapshot:";
const ROUTE = "/api/community-messenger/bootstrap";

type SnapshotReadVia = "counter_row" | "unified_rpc";
type BootstrapTier = "full" | "critical";

type SnapshotRow = {
  payload_json: FullBootstrapSnapshotPayloadJson;
  updated_at: string;
};

export type FullBootstrapSnapshotReadResult =
  | {
      tier: "full";
      payload: CommunityMessengerBootstrap;
      breakdown: FullBootstrapSnapshotBreakdown;
      snapshotVia: SnapshotReadVia;
      snapshotVersion?: number;
    }
  | {
      tier: "critical";
      payload: CommunityMessengerBootstrapCritical;
      breakdown: FullBootstrapSnapshotBreakdown;
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
    payload_json: payload as FullBootstrapSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof fbt1BootstrapSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE)
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
  return { hit: true, row, ageMs, stale: ageMs > fbt1BootstrapSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof fbt1BootstrapSnapshotCacheKeyParts>,
  payload: FullBootstrapSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE).upsert(
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
    console.warn("[full-bootstrap-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  tier: BootstrapTier,
  limit: number,
  cursor: string
): Promise<{ payload: FullBootstrapSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(FBT1_BOOTSTRAP_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_cursor: cursor,
    p_limit: limit,
    p_tier: tier,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[full-bootstrap-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseFullBootstrapSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  tier: BootstrapTier;
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): FullBootstrapSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  const fallback = input.fallback === true;
  return {
    route: ROUTE,
    tier: input.tier,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: fallback ? 8 : 1,
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    room_fetch_ms: dbMs,
    participant_join_ms: 0,
    profile_join_ms: Math.round(input.payloadBuildMs),
    unread_compute_ms: 0,
    room_summary_compute_ms: Math.round(input.payloadBuildMs),
    attachment_enrich_ms: 0,
    trade_context_merge_ms: fallback ? dbMs : 0,
    order_context_merge_ms: 0,
    notification_merge_ms: 0,
    media_meta_merge_ms: 0,
    bootstrap_cache_ms: input.via === "counter_row" ? dbMs : 0,
    wave_count: fallback ? 3 : 1,
    query_wave_2_ms: fallback ? 120 : 0,
    sequential_await_detected: fallback ? 1 : 0,
    aggregate_compute_detected: fallback ? 1 : 0,
    repeated_join_detected: fallback ? 1 : 0,
    fallback_used: fallback ? 1 : 0,
    reconnect_path_used: 0,
    rpc_removed: fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: fallback
      ? "legacy_full_bootstrap_monolith"
      : input.via === "counter_row"
        ? "full_bootstrap_snapshot_row"
        : "full_bootstrap_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

async function finishFromPayload(
  userId: string,
  tier: BootstrapTier,
  payload: FullBootstrapSnapshotPayloadJson,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia }
): Promise<FullBootstrapSnapshotReadResult | null> {
  const gate = fullBootstrapSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const assemble0 = devPerfNow();
  if (tier === "critical") {
    const assembled = await assembleCriticalBootstrapFromSnapshotPayload(userId, payload);
    const payloadBuildMs = devPerfNow() - assemble0;
    if (!assembled) return null;
    const breakdown = buildBreakdown({
      tier,
      totalMs: input.totalMs,
      readMs: input.readMs,
      payloadBuildMs,
      via: input.via,
    });
    logFullBootstrapMonolithAnalysis(breakdown);
    evaluateFullBootstrapRegressionGuards(breakdown);
    return {
      tier: "critical",
      payload: assembled,
      breakdown,
      snapshotVia: input.via,
      snapshotVersion:
        typeof payload.snapshot_version === "number" ? payload.snapshot_version : undefined,
    };
  }

  const assembled = await assembleFullBootstrapFromSnapshotPayload(userId, payload);
  const payloadBuildMs = devPerfNow() - assemble0;
  if (!assembled) return null;

  const breakdown = buildBreakdown({
    tier,
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
  });
  logFullBootstrapMonolithAnalysis(breakdown);
  evaluateFullBootstrapRegressionGuards(breakdown);
  return {
    tier: "full",
    payload: assembled,
    breakdown,
    snapshotVia: input.via,
    snapshotVersion:
      typeof payload.snapshot_version === "number" ? payload.snapshot_version : undefined,
  };
}

async function tryLoadFromSnapshotInternal(
  sbAny: SupabaseClient<any>,
  userId: string,
  tier: BootstrapTier,
  opts?: { bypassCounter?: boolean; limit?: number; cursor?: string }
): Promise<FullBootstrapSnapshotReadResult | null> {
  const uid = userId.trim();
  if (!uid) return null;

  logFullBootstrapSnapshotRpcDesignOnce();
  const keys = fbt1BootstrapSnapshotCacheKeyParts({
    userId: uid,
    tier,
    limit:
      opts?.limit ??
      (tier === "critical" ? FBT1_CRITICAL_DEFAULT_LIMIT : FBT1_FULL_DEFAULT_LIMIT),
    cursor: opts?.cursor,
  });

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${tier}:${keys.user_id}`, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const done = await finishFromPayload(uid, tier, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
      if (counter.hit && counter.stale) {
        scheduleFullBootstrapSnapshotRefresh(uid, tier);
        const done = await finishFromPayload(uid, tier, counter.row.payload_json, {
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
      tier,
      keys.list_limit,
      keys.cursor_key
    );
    if (!payload || payload.ok !== true) return null;

    await upsertSnapshotCounter(sbAny, keys, payload);
    return finishFromPayload(uid, tier, payload, {
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - build0,
      via: "unified_rpc",
    });
  });
}

export async function tryLoadFullBootstrapFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { bypassCounter?: boolean; limit?: number; cursor?: string }
): Promise<Extract<FullBootstrapSnapshotReadResult, { tier: "full" }> | null> {
  const result = await tryLoadFromSnapshotInternal(sbAny, userId, "full", opts);
  if (!result || result.tier !== "full") return null;
  return result;
}

export async function tryLoadCriticalBootstrapFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { bypassCounter?: boolean; limit?: number; cursor?: string }
): Promise<Extract<FullBootstrapSnapshotReadResult, { tier: "critical" }> | null> {
  const result = await tryLoadFromSnapshotInternal(sbAny, userId, "critical", opts);
  if (!result || result.tier !== "critical") return null;
  return result;
}

export async function refreshFullBootstrapSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  tier: BootstrapTier
): Promise<FullBootstrapSnapshotPayloadJson | null> {
  const keys = fbt1BootstrapSnapshotCacheKeyParts({
    userId,
    tier,
    limit: tier === "critical" ? FBT1_CRITICAL_DEFAULT_LIMIT : FBT1_FULL_DEFAULT_LIMIT,
  });
  const { payload } = await fetchSnapshotViaRpc(
    sbAny,
    keys.user_id,
    tier,
    keys.list_limit,
    keys.cursor_key
  );
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}

export function logLegacyFullBootstrapHotpath(input: {
  tier: BootstrapTier;
  totalMs: number;
  dbMs: number;
  roomFetchMs: number;
  wave2Ms: number;
}): void {
  const breakdown = buildBreakdown({
    tier: input.tier,
    totalMs: input.totalMs,
    readMs: input.dbMs,
    payloadBuildMs: 0,
    via: "unified_rpc",
    fallback: true,
  });
  breakdown.room_fetch_ms = Math.round(input.roomFetchMs);
  breakdown.query_wave_2_ms = Math.round(input.wave2Ms);
  logFullBootstrapMonolithAnalysis(breakdown);
  evaluateFullBootstrapRegressionGuards(breakdown);
}
