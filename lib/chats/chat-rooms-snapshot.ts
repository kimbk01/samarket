/**
 * CR1 trade chat rooms snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatRoom } from "@/lib/types/chat";
import {
  assembleChatRoomsFromSnapshotPayload,
  chatRoomsSnapshotGateFromPayload,
  parseChatRoomsSnapshotRpcData,
  type ChatRoomsSnapshotPayloadJson,
} from "@/lib/chats/chat-rooms-snapshot-assemble";
import {
  CHAT_ROOMS_SNAPSHOT_DEFAULT_LIMIT,
  CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE,
  CHAT_ROOMS_SNAPSHOT_RPC,
  CHAT_ROOMS_SNAPSHOT_TABLE,
  chatRoomsSnapshotCacheKeyParts,
  chatRoomsSnapshotCounterTtlMs,
} from "@/lib/chats/chat-rooms-snapshot-counter";
import {
  logChatRoomsMonolithAnalysis,
  logChatRoomsSnapshotRpcDesignOnce,
} from "@/lib/chats/chat-rooms-snapshot-hotpath-analysis";
import {
  evaluateChatRoomsRegressionGuards,
  type ChatRoomsSnapshotBreakdown,
} from "@/lib/chats/chat-rooms-snapshot-regression-guard";
import { scheduleChatRoomsSnapshotRefresh } from "@/lib/chats/chat-rooms-snapshot-refresh";
import type { EffectiveListSegment } from "@/lib/chats/chat-rooms-list-core";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cr1-chat-rooms-snapshot:";
const ROUTE = "/api/chat/rooms";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: ChatRoomsSnapshotPayloadJson;
  updated_at: string;
};

export type ChatRoomsSnapshotReadResult = {
  rooms: ChatRoom[];
  breakdown: ChatRoomsSnapshotBreakdown;
  snapshotVia: SnapshotReadVia;
  snapshotVersion?: number;
};

function counterSelectFields(): string {
  return ["user_id", "list_scope", "list_limit", "cursor_key", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    payload_json: payload as ChatRoomsSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof chatRoomsSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(CHAT_ROOMS_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("user_id", keys.user_id)
    .eq("list_scope", keys.list_scope)
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
  return { hit: true, row, ageMs, stale: ageMs > chatRoomsSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof chatRoomsSnapshotCacheKeyParts>,
  payload: ChatRoomsSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(CHAT_ROOMS_SNAPSHOT_TABLE).upsert(
    {
      user_id: keys.user_id,
      list_scope: keys.list_scope,
      list_limit: keys.list_limit,
      cursor_key: keys.cursor_key,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,list_scope,list_limit,cursor_key" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[chat-rooms-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  limit: number,
  cursor: string
): Promise<{ payload: ChatRoomsSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(CHAT_ROOMS_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_cursor: cursor,
    p_limit: limit,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[chat-rooms-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseChatRoomsSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  totalMs: number;
  readMs: number;
  payloadBuildMs: number;
  via: SnapshotReadVia;
  fallback?: boolean;
}): ChatRoomsSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: input.fallback ? 7 : 1,
    transport_ms: dbMs,
    payload_build_ms: Math.round(input.payloadBuildMs),
    rooms_fetch_ms: dbMs,
    participant_join_ms: 0,
    profile_join_ms: 0,
    unread_compute_ms: Math.round(input.payloadBuildMs),
    room_summary_compute_ms: Math.round(input.payloadBuildMs),
    trade_meta_merge_ms: 0,
    normalization_ms: Math.round(input.payloadBuildMs),
    ordering_compute_ms: Math.round(input.payloadBuildMs),
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: input.fallback ? 7 : 1,
    query_wave_2_ms: input.fallback ? 120 : 0,
    sequential_await_detected: input.fallback ? 1 : 0,
    aggregate_compute_detected: input.fallback ? 1 : 0,
    repeated_join_detected: input.fallback ? 1 : 0,
    fallback_used: input.fallback ? 1 : 0,
    reconnect_path_used: 0,
    rpc_removed: input.fallback ? 0 : 1,
    snapshot_via: input.via,
    worst_stage: input.fallback
      ? "legacy_rooms_monolith"
      : input.via === "counter_row"
        ? "trade_chat_rooms_snapshot_row"
        : "chat_rooms_unified_rpc",
    worst_stage_ms: dbMs,
  };
}

async function finishFromPayload(
  userId: string,
  segment: EffectiveListSegment,
  payload: ChatRoomsSnapshotPayloadJson,
  input: { totalMs: number; readMs: number; via: SnapshotReadVia }
): Promise<ChatRoomsSnapshotReadResult | null> {
  const gate = chatRoomsSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const assemble0 = devPerfNow();
  const rooms = assembleChatRoomsFromSnapshotPayload(userId, segment, payload);
  const payloadBuildMs = devPerfNow() - assemble0;
  if (!rooms) return null;

  const breakdown = buildBreakdown({
    totalMs: input.totalMs,
    readMs: input.readMs,
    payloadBuildMs,
    via: input.via,
  });
  logChatRoomsMonolithAnalysis(breakdown);
  evaluateChatRoomsRegressionGuards(breakdown);

  return {
    rooms,
    breakdown,
    snapshotVia: input.via,
    snapshotVersion:
      typeof payload.snapshot_version === "number" ? payload.snapshot_version : undefined,
  };
}

export async function tryLoadChatRoomsFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  segment: EffectiveListSegment,
  opts?: { bypassCounter?: boolean; limit?: number; cursor?: string }
): Promise<ChatRoomsSnapshotReadResult | null> {
  const uid = userId.trim();
  if (!uid) return null;

  logChatRoomsSnapshotRpcDesignOnce();
  const keys = chatRoomsSnapshotCacheKeyParts({
    userId: uid,
    limit: opts?.limit ?? CHAT_ROOMS_SNAPSHOT_DEFAULT_LIMIT,
    cursor: opts?.cursor,
    scope: CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE,
  });

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.user_id}:${segment}`, async () => {
    const build0 = devPerfNow();

    if (!opts?.bypassCounter) {
      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        const done = await finishFromPayload(uid, segment, counter.row.payload_json, {
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
        });
        if (done) return done;
      }
      if (counter.hit && counter.stale) {
        scheduleChatRoomsSnapshotRefresh(uid);
        const done = await finishFromPayload(uid, segment, counter.row.payload_json, {
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
    return finishFromPayload(uid, segment, payload, {
      totalMs: devPerfNow() - build0,
      readMs: rpcMs || devPerfNow() - build0,
      via: "unified_rpc",
    });
  });
}

export async function refreshChatRoomsSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<ChatRoomsSnapshotPayloadJson | null> {
  const keys = chatRoomsSnapshotCacheKeyParts({
    userId,
    scope: CHAT_ROOMS_SNAPSHOT_DEFAULT_SCOPE,
    limit: CHAT_ROOMS_SNAPSHOT_DEFAULT_LIMIT,
  });
  const { payload } = await fetchSnapshotViaRpc(sbAny, keys.user_id, keys.list_limit, keys.cursor_key);
  if (!payload || payload.ok !== true) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}

export function logLegacyChatRoomsHotpath(input: {
  totalMs: number;
  dbMs: number;
  queryWave2Ms: number;
  waveCount: number;
  payloadBuildMs?: number;
}): void {
  const breakdown: ChatRoomsSnapshotBreakdown = {
    route: ROUTE,
    total_ms: Math.round(input.totalMs),
    db_ms: Math.round(input.dbMs),
    round_trips: 7,
    transport_ms: Math.round(input.dbMs),
    payload_build_ms: Math.round(input.payloadBuildMs ?? 0),
    rooms_fetch_ms: Math.round(input.dbMs),
    participant_join_ms: Math.round(input.queryWave2Ms),
    profile_join_ms: Math.round(input.queryWave2Ms),
    unread_compute_ms: Math.round(input.queryWave2Ms),
    room_summary_compute_ms: Math.round(input.queryWave2Ms),
    trade_meta_merge_ms: Math.round(input.queryWave2Ms),
    normalization_ms: Math.round(input.queryWave2Ms),
    ordering_compute_ms: Math.round(input.queryWave2Ms),
    cache_hit: 0,
    wave_count: input.waveCount,
    query_wave_2_ms: Math.round(input.queryWave2Ms),
    sequential_await_detected: 1,
    aggregate_compute_detected: 1,
    repeated_join_detected: 1,
    fallback_used: 1,
    reconnect_path_used: 0,
    rpc_removed: 0,
    snapshot_via: "legacy_multi_wave",
    worst_stage: "legacy_rooms_monolith",
    worst_stage_ms: Math.round(input.dbMs),
  };
  logChatRoomsMonolithAnalysis(breakdown);
  evaluateChatRoomsRegressionGuards(breakdown);
}
