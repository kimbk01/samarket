/**
 * Room bootstrap critical snapshot — read path (counter row → unified RPC → legacy fallback).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";
import {
  parseRoomBootstrapSnapshotPayload,
  parseRoomBootstrapSnapshotRpcData,
  type RoomBootstrapSnapshotPayloadJson,
  type RoomBootstrapSnapshotWaveA,
} from "@/lib/community-messenger/room-bootstrap-snapshot-assemble";
import {
  CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE,
  roomBootstrapSnapshotCacheKeyParts,
  roomBootstrapSnapshotCounterTtlMs,
} from "@/lib/community-messenger/room-bootstrap-snapshot-counter";
import { scheduleRoomBootstrapSnapshotRefresh } from "@/lib/community-messenger/room-bootstrap-snapshot-refresh";
import {
  evaluateRoomBootstrapRegressionGuards,
  type RoomBootstrapSnapshotBreakdown,
} from "@/lib/community-messenger/room-bootstrap-regression-guard";
import {
  logBootstrapHotpathAnalysis,
  logRoomBootstrapSnapshotRpcDesignOnce,
} from "@/lib/community-messenger/room-bootstrap-hotpath-analysis";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const ROOM_BOOTSTRAP_SNAPSHOT_RPC = "get_community_messenger_room_bootstrap_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cm-room-bootstrap-snapshot:";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  snapshot_tier: string;
  message_limit: number;
  payload_json: RoomBootstrapSnapshotPayloadJson;
  updated_at: string;
};

function counterSelectFields(): string {
  return ["user_id", "room_id", "snapshot_tier", "message_limit", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    snapshot_tier: typeof data.snapshot_tier === "string" ? data.snapshot_tier : "critical",
    message_limit: Math.max(1, Math.floor(Number(data.message_limit) || 24)),
    payload_json: payload as RoomBootstrapSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomId: string,
  snapshotTier: string,
  messageLimit: number
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const keys = roomBootstrapSnapshotCacheKeyParts(userId, roomId, snapshotTier, messageLimit);
  const { data, error } = await sbAny
    .from(CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("user_id", keys.user_id)
    .eq("room_id", keys.room_id)
    .eq("snapshot_tier", keys.snapshot_tier)
    .eq("message_limit", keys.message_limit)
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
  return { hit: true, row, ageMs, stale: ageMs > roomBootstrapSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomId: string,
  snapshotTier: string,
  messageLimit: number,
  payload: RoomBootstrapSnapshotPayloadJson
): Promise<void> {
  const keys = roomBootstrapSnapshotCacheKeyParts(userId, roomId, snapshotTier, messageLimit);
  const { error } = await sbAny.from(CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE).upsert(
    {
      user_id: keys.user_id,
      room_id: keys.room_id,
      snapshot_tier: keys.snapshot_tier,
      message_limit: keys.message_limit,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,room_id,snapshot_tier,message_limit" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[room-bootstrap-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomId: string,
  snapshotTier: string,
  messageLimit: number
): Promise<{ payload: RoomBootstrapSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(ROOM_BOOTSTRAP_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_room_id: roomId.trim(),
    p_snapshot_tier: snapshotTier,
    p_message_limit: messageLimit,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[room-bootstrap-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseRoomBootstrapSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  roomId: string;
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  stale?: boolean;
}): RoomBootstrapSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: `/api/community-messenger/rooms/${input.roomId}/bootstrap`,
    room_id: input.roomId,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: 1,
    transport_ms: dbMs,
    payload_build_ms: 0,
    participant_join_ms: 0,
    profile_join_ms: 0,
    unread_compute_ms: 0,
    room_summary_compute_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    aggregate_compute_detected: 0,
    embed_join_detected: 0,
    worst_stage: input.via === "counter_row" ? "room_bootstrap_snapshot_row" : "room_bootstrap_unified_rpc",
    worst_stage_ms: dbMs,
    cache_hit_reason:
      input.via === "counter_row" ? "room_bootstrap_snapshot_row" : "room_bootstrap_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via === "counter_row" ? "counter_row" : "unified_rpc",
  };
}

export type RoomBootstrapSnapshotWaveAResult = {
  waveA: RoomBootstrapSnapshotWaveA;
  breakdown: RoomBootstrapSnapshotBreakdown;
};

/** Snapshot-first critical wave A — null = unified RPC unavailable, caller may legacy fallback. */
export async function tryLoadRoomBootstrapCriticalWaveAFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomId: string,
  messageLimit: number,
  diagnostics?: CommunityMessengerRoomSnapshotDiagnostics
): Promise<RoomBootstrapSnapshotWaveAResult | null> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return null;

  logRoomBootstrapSnapshotRpcDesignOnce();

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${uid}:${rid}:${messageLimit}`, async () => {
    const build0 = devPerfNow();
    const tier = "critical";

    const finish = (
      payload: RoomBootstrapSnapshotPayloadJson,
      readMs: number,
      via: SnapshotReadVia,
      stale?: boolean
    ): RoomBootstrapSnapshotWaveAResult | null => {
      const waveA = parseRoomBootstrapSnapshotPayload(uid, payload);
      if (!waveA) return null;
      const breakdown = buildBreakdown({
        roomId: rid,
        totalMs: devPerfNow() - build0,
        readMs,
        via,
        stale,
      });
      logBootstrapHotpathAnalysis(breakdown, {
        structuralNote:
          via === "counter_row"
            ? "request-time wave A removed — precomputed room snapshot row + CPU normalize"
            : "unified RPC cold fill — 1 RTT replaces room+participants+messages parallel wave",
      });
      evaluateRoomBootstrapRegressionGuards({
        breakdown,
        allowedRoundTrips: 1,
        snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
        staleSnapshot: stale,
      });
      if (diagnostics) {
        diagnostics.snapshotQueryAParallelEndMs = Math.round(readMs);
        diagnostics.participantsSqlFetchMs = 0;
        diagnostics.roomBootstrapSnapshotPath = 1;
        diagnostics.roomBootstrapSnapshotVia = via;
      }
      return { waveA, breakdown };
    };

    const read0 = devPerfNow();
    const counter = await readSnapshotCounter(sbAny, uid, rid, tier, messageLimit);
    const readMs = devPerfNow() - read0;

    if (counter.hit && !counter.stale) {
      const done = finish(counter.row.payload_json, readMs, "counter_row");
      if (done) return done;
    }
    if (counter.hit && counter.stale) {
      scheduleRoomBootstrapSnapshotRefresh(uid, rid, messageLimit);
      const done = finish(counter.row.payload_json, readMs, "counter_row", true);
      if (done) return done;
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, uid, rid, tier, messageLimit);
    if (!payload?.room) return null;

    await upsertSnapshotCounter(sbAny, uid, rid, tier, messageLimit, payload);
    return finish(payload, rpcMs || devPerfNow() - read0, "unified_rpc");
  });
}

export async function refreshRoomBootstrapSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomId: string,
  messageLimit: number
): Promise<RoomBootstrapSnapshotPayloadJson | null> {
  const { payload } = await fetchSnapshotViaRpc(sbAny, userId, roomId, "critical", messageLimit);
  if (!payload?.room) return null;
  await upsertSnapshotCounter(sbAny, userId, roomId, "critical", messageLimit, payload);
  return payload;
}
