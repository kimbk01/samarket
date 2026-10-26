/**
 * Room bootstrap critical snapshot — unified RPC (1 RTT) → legacy fallback when the RPC is unavailable.
 *
 * R2-c (docs/audit/messenger-2026-10-27-r2-request-fanout-plan.md): the precomputed counter row
 * (`community_messenger_room_bootstrap_snapshots`) is no longer read or written. With a 5s freshness
 * window almost every entry rebuilt it (운영 24h: RPC 8,162 · upsert 8,151) and stale rows could carry an
 * old read position (D-12). Every entry now returns the RPC result computed for this request.
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
  evaluateRoomBootstrapRegressionGuards,
  type RoomBootstrapSnapshotBreakdown,
} from "@/lib/community-messenger/room-bootstrap-regression-guard";
import {
  logBootstrapHotpathAnalysis,
  logRoomBootstrapSnapshotRpcDesignOnce,
} from "@/lib/community-messenger/room-bootstrap-hotpath-analysis";
import {
  measureJsonUtf8Bytes,
  setLastBootstrapColdFillServerPartial,
} from "@/lib/community-messenger/bootstrap-cold-fill-deep-breakdown";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const ROOM_BOOTSTRAP_SNAPSHOT_RPC = "get_community_messenger_room_bootstrap_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cm-room-bootstrap-snapshot:";

type SnapshotReadVia = "unified_rpc";

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
    cache_hit: 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    aggregate_compute_detected: 0,
    embed_join_detected: 0,
    worst_stage: "room_bootstrap_unified_rpc",
    worst_stage_ms: dbMs,
    cache_hit_reason: "room_bootstrap_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via,
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
      via: SnapshotReadVia
    ): RoomBootstrapSnapshotWaveAResult | null => {
      const des0 = devPerfNow();
      const waveA = parseRoomBootstrapSnapshotPayload(uid, payload);
      const snapshot_deserialize_ms = Math.round(devPerfNow() - des0);
      if (!waveA) return null;
      setLastBootstrapColdFillServerPartial({
        rpc_ms: Math.round(readMs),
        rpc_payload_bytes: measureJsonUtf8Bytes(payload),
        snapshot_deserialize_ms,
        snapshot_via: via,
      });
      const breakdown = buildBreakdown({
        roomId: rid,
        totalMs: devPerfNow() - build0,
        readMs,
        via,
      });
      logBootstrapHotpathAnalysis(breakdown, {
        structuralNote: "unified RPC — 1 RTT replaces room+participants+messages parallel wave",
      });
      evaluateRoomBootstrapRegressionGuards({
        breakdown,
        allowedRoundTrips: 1,
        snapshotVia: via,
      });
      if (diagnostics) {
        diagnostics.snapshotQueryAParallelEndMs = Math.round(readMs);
        diagnostics.participantsSqlFetchMs = 0;
        diagnostics.roomBootstrapSnapshotPath = 1;
        diagnostics.roomBootstrapSnapshotVia = via;
      }
      return { waveA, breakdown };
    };

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, uid, rid, tier, messageLimit);
    if (!payload?.room) return null;
    setLastBootstrapColdFillServerPartial({
      rpc_ms: Math.round(rpcMs),
      rpc_payload_bytes: measureJsonUtf8Bytes(payload),
      snapshot_deserialize_ms: 0,
      snapshot_via: "unified_rpc",
    });
    return finish(payload, rpcMs || devPerfNow() - build0, "unified_rpc");
  });
}
